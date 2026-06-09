import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseImportMisuratori, type MisuratoreRefInput } from '@/lib/risanamento/parseImportMisuratori';

export const runtime = 'nodejs';

const BATCH = 500;

/** POST: importa un'estrazione Excel/CSV nella tabella di riferimento. */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
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
  const payload = parsed.records.map((r: MisuratoreRefInput) => ({ ...r, import_id: importId }));

  // Insert non atomico tra batch: se un batch fallisce, i precedenti restano committati.
  // Accettabile per un import admin in Fase 1; riportiamo `inseriti_parziali` per visibilita.
  let inseriti = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabaseAdmin
      .from('risanamento_misuratori_ref')
      .insert(chunk);
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
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('risanamento_import_catalog')
    .select('import_id, righe, caricato_at, indirizzo_campione')
    .order('caricato_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** DELETE: elimina tutte le righe di un import (?import_id=...). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const importId = new URL(req.url).searchParams.get('import_id');
  if (!importId) return NextResponse.json({ error: 'import_id mancante.' }, { status: 400 });
  const { error } = await supabaseAdmin
    .from('risanamento_misuratori_ref')
    .delete()
    .eq('import_id', importId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
