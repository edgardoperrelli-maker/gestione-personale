import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseImportMisuratori, type MisuratoreRefInput } from '@/lib/risanamento/parseImportMisuratori';

export const runtime = 'nodejs';

const BATCH = 500;

type Dataset = { tabella: 'risanamento_misuratori_ref' | 'limitazione_misuratori_ref'; vista: 'risanamento_import_catalog' | 'limitazione_import_catalog' };
function risolviDataset(attivita: string | null): Dataset {
  return (attivita ?? '').toLowerCase() === 'limitazione'
    ? { tabella: 'limitazione_misuratori_ref', vista: 'limitazione_import_catalog' }
    : { tabella: 'risanamento_misuratori_ref', vista: 'risanamento_import_catalog' };
}
function committenteValido(c: string | null): 'acea' | 'italgas' {
  return c === 'italgas' ? 'italgas' : 'acea';
}

/** POST: importa un'estrazione Excel/CSV nella tabella di riferimento. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  const attivita = (form.get('attivita') as string | null);
  const committente = committenteValido(form.get('committente') as string | null);
  const ds = risolviDataset(attivita);
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }

  // Endpoint admin a basso traffico: il file viene letto interamente in memoria.
  // Volume atteso poche migliaia di righe (qualche MB); se in futuro cresce, valutare un limite esplicito.
  let rows: unknown[][];
  try {
    let wb: XLSX.WorkBook;
    if (name.endsWith('.csv')) {
      const text = (await file.text()).replace(/^﻿/, ''); // strip BOM
      // I CSV dei gestionali italiani usano spesso ';' come separatore.
      const fs = /;/.test(text.split(/\r?\n/)[0] ?? '') ? ';' : ',';
      wb = XLSX.read(text, { type: 'string', FS: fs });
    } else {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    }
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws) return NextResponse.json({ error: 'File vuoto o privo di fogli.' }, { status: 422 });
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseImportMisuratori(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'File non valido.' }, { status: 422 });
  }
  if (parsed.records.length === 0) {
    return NextResponse.json({ error: 'Nessuna riga valida (matricola assente).' }, { status: 422 });
  }

  const importId = randomUUID();
  const isLim = ds.tabella === 'limitazione_misuratori_ref';
  const payload = parsed.records.map((r: MisuratoreRefInput) => {
    const { odl, ...base } = r;
    return isLim
      ? { ...base, odl, import_id: importId, committente }
      : { ...base, import_id: importId };
  });

  // Insert non atomico tra batch: se un batch fallisce, i precedenti restano committati.
  // Accettabile per un import admin in Fase 1; riportiamo `inseriti_parziali` per visibilita.
  let inseriti = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.from(ds.tabella).insert(chunk);
    if (error) return NextResponse.json({ error: error.message, inseriti_parziali: inseriti }, { status: 500 });
    inseriti += chunk.length;
  }

  return NextResponse.json({
    success: true,
    import_id: importId,
    inseriti,
    totale: parsed.totale,
    scartate: parsed.scartate,
  });
}

/** GET: catalogo degli import caricati (dalla vista). */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const ds = risolviDataset(new URL(req.url).searchParams.get('attivita'));
  const { data, error } = await supabaseAdmin
    .from(ds.vista)
    .select('import_id, righe, caricato_at, indirizzo_campione')
    .order('caricato_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** DELETE: elimina tutte le righe di un import (?import_id=...). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const importId = url.searchParams.get('import_id');
  if (!importId) return NextResponse.json({ error: 'import_id mancante.' }, { status: 400 });
  const ds = risolviDataset(url.searchParams.get('attivita'));
  const { error } = await supabaseAdmin.from(ds.tabella).delete().eq('import_id', importId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
