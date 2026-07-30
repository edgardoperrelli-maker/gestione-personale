import 'server-only';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseMasterUpload } from '@/lib/attivita/masterUpload';

export const runtime = 'nodejs';

const BATCH = 500;
const COMMITTENTI = ['acea', 'italgas', 'acqualatina', 'altro'] as const;
type Committente = (typeof COMMITTENTI)[number];

function committenteValido(c: string | null): Committente {
  return (COMMITTENTI as readonly string[]).includes(c ?? '') ? (c as Committente) : 'acea';
}

/** GET: i master caricati + info sullo snapshot DUNNING dell'agente (per la pagina admin). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from('template_master')
    .select('id, nome, committente, attivo, file_nome, operazione_default, righe_totali, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Info di contorno sul master DUNNING via agente: best-effort (la pagina vive anche senza).
  let snapshot: { righe: number; raccolto_at: string | null } | null = null;
  try {
    const { count } = await supabaseAdmin
      .from('acea_master_snapshot')
      .select('odl', { count: 'exact', head: true });
    const { data: ultimo } = await supabaseAdmin
      .from('acea_master_snapshot')
      .select('raccolto_at')
      .order('raccolto_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshot = { righe: count ?? 0, raccolto_at: (ultimo as { raccolto_at?: string } | null)?.raccolto_at ?? null };
  } catch { /* tabella assente o vuota: nessuna info */ }

  return NextResponse.json({ masters: data ?? [], snapshot }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST: carica un file master (multipart: `file`, `nome?`, `committente?`, `operazione_default?`).
 * Le colonne si risolvono per NOME (parseMasterUpload); le righe senza ODL sono scartate.
 * Il master entra ATTIVO: da subito nel foglio MasterODL del template.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const nomeFile = file.name;
  const lower = nomeFile.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }
  const nome = String(form.get('nome') ?? '').trim() || nomeFile.replace(/\.(xlsx|xls|csv)$/i, '');
  const committente = committenteValido(form.get('committente') as string | null);
  const operazioneDefault = String(form.get('operazione_default') ?? '').trim() || null;

  // Endpoint admin a basso traffico: file letto in memoria (poche migliaia di righe attese).
  let rows: unknown[][];
  try {
    let wb: XLSX.WorkBook;
    if (lower.endsWith('.csv')) {
      const text = (await file.text()).replace(/^﻿/, '');
      const fs = /;/.test(text.split(/\r?\n/)[0] ?? '') ? ';' : ',';
      wb = XLSX.read(text, { type: 'string', FS: fs });
    } else {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    }
    const ws = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined;
    if (!ws) return NextResponse.json({ error: 'File vuoto o privo di fogli.' }, { status: 422 });
    // raw:false: gli ODL numerici arrivano come TESTO formattato (mai notazione scientifica).
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseMasterUpload(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'File non valido.' }, { status: 422 });
  }
  if (parsed.righe.length === 0) {
    return NextResponse.json({ error: 'Nessuna riga valida (ODL assente).' }, { status: 422 });
  }

  const { data: master, error: eIns } = await supabaseAdmin
    .from('template_master')
    .insert({ nome, committente, file_nome: nomeFile, operazione_default: operazioneDefault, righe_totali: parsed.righe.length })
    .select('id')
    .single();
  if (eIns || !master) return NextResponse.json({ error: eIns?.message ?? 'Insert fallita.' }, { status: 500 });
  const masterId = (master as { id: string }).id;

  const payload = parsed.righe.map((r) => ({ master_id: masterId, ...r }));
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabaseAdmin.from('template_master_righe').insert(payload.slice(i, i + BATCH));
    if (error) {
      // niente master a metà: si toglie il file (cascade sulle righe già inserite)
      await supabaseAdmin.from('template_master').delete().eq('id', masterId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    id: masterId,
    righe: parsed.righe.length,
    totale: parsed.totale,
    scartate: parsed.scartate,
  });
}
