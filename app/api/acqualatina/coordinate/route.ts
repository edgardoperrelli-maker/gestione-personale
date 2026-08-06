import 'server-only';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  abbinaCoordinate, parseCoordinateFile, type OrdineDaCoordinare,
} from '@/lib/acqualatina/coordinateDaFile';

export const runtime = 'nodejs';
// Il file del comune è grande (4.196 righe per Terracina) e le scritture vanno una per riga:
// stesso tetto del sync dal master, che fa lo stesso mestiere sugli stessi volumi.
export const maxDuration = 300;

const PAGINA = 1000;
const CONCORRENZA = 20;

/**
 * POST /api/acqualatina/coordinate — le coordinate GPS del committente sul registro.
 *
 * ARRICCHISCE e basta: aggiorna la colonna `coordinate` delle righe che il registro ha GIÀ,
 * agganciandole per COD_FORNITURA (l'impianto, che è il punto) e — quando la fornitura non si
 * trova — per ODL, coprendo tutte le operazioni di quell'ordine. Non inserisce mai una riga: una
 * fornitura che il modulo non conosce si conta e si dice.
 *
 * Non tocca né stati né pianificazione né anagrafica: la coordinata è un dato a parte, come nel
 * rapportino (design 2026-06-05) — non entra in geocoding, routing o mappa, che continuano a
 * lavorare sull'indirizzo. Idempotente: ricaricare lo stesso file una seconda volta scrive zero.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const nome = file.name.toLowerCase();
  if (!nome.endsWith('.csv') && !nome.endsWith('.xls') && !nome.endsWith('.xlsx')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }

  // Endpoint admin a basso traffico: il foglio si legge tutto in memoria, come l'import master.
  let rows: unknown[][];
  try {
    let wb: XLSX.WorkBook;
    if (nome.endsWith('.csv')) {
      const text = (await file.text()).replace(/^﻿/, '');
      const fs = /;/.test(text.split(/\r?\n/)[0] ?? '') ? ';' : ',';
      wb = XLSX.read(text, { type: 'string', FS: fs });
    } else {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    }
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!ws) return NextResponse.json({ error: 'File vuoto o privo di fogli.' }, { status: 422 });
    // `raw: false`: le coordinate arrivano come le scrive il file (anche con la virgola decimale),
    // e `parseLatLng` le normalizza — non si passa mai dal float di Excel.
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseCoordinateFile(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'File non valido.' }, { status: 422 });
  }
  if (parsed.righe.length === 0) {
    return NextResponse.json(
      { error: 'Nessuna riga con coordinate valide e un aggancio (CODODL o COD_FORNITURA).' },
      { status: 422 },
    );
  }

  try {
    // Il registro intero, paginato: l'abbinamento è per fornitura, che non è indicizzata — e
    // comunque una scansione sola costa meno di 4.000 query puntuali.
    const registro: OrdineDaCoordinare[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('odl, numero_operazione, impianto, coordinate')
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as OrdineDaCoordinare[];
      registro.push(...blocco);
      if (blocco.length < PAGINA) break;
    }

    const { aggiornamenti, giaUguali, nonTrovate } = abbinaCoordinate(parsed.righe, registro);

    // Una `update` per riga (la chiave è la coppia), a blocchi concorrenti: stesso schema delle
    // correzioni anagrafiche del sync dal master.
    let aggiornate = 0;
    for (let i = 0; i < aggiornamenti.length; i += CONCORRENZA) {
      await Promise.all(aggiornamenti.slice(i, i + CONCORRENZA).map(async (a) => {
        const { error } = await supabaseAdmin
          .from('acqualatina_ordini')
          .update({ coordinate: a.coordinate })
          .eq('odl', a.odl)
          .eq('numero_operazione', a.numero_operazione);
        if (error) throw error;
        aggiornate += 1;
      }));
    }

    return NextResponse.json(
      {
        letteDalFile: parsed.totale,
        conCoordinate: parsed.righe.length,
        senzaCoordinate: parsed.senzaCoordinate,
        senzaAggancio: parsed.senzaAggancio,
        aggiornate,
        giaUguali,
        nonTrovate,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[acqualatina/coordinate] import fallito:', e);
    const msg = e instanceof Error ? e.message : 'Import delle coordinate non riuscito.';
    // La colonna nasce con la migration 20260806090000: senza, il messaggio dice cosa manca
    // invece di un «column does not exist» che non aiuta nessuno.
    return NextResponse.json(
      {
        error: /coordinate/i.test(msg) && /column|schema/i.test(msg)
          ? 'La colonna `coordinate` non esiste ancora sul registro: applica la migration 20260806090000_acqualatina_ordini_coordinate.sql.'
          : msg,
      },
      { status: 500 },
    );
  }
}
