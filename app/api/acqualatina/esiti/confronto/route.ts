import 'server-only';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  confrontaEsitiSito, parseEsecuzioni, type RigaRegistroPerConfronto,
} from '@/lib/acqualatina/confrontoEsiti';
import { riconciliaChiusureAcqualatina } from '@/lib/acqualatina/riconciliaRegistro';
import { partiRoma } from '@/lib/agente/orarioRoma';

export const runtime = 'nodejs';

const PAGINA = 1000;

/**
 * POST /api/acqualatina/esiti/confronto — il file «ESECUZIONI» del sito contro il registro.
 *
 * SOLO lettura, su tutte e due le parti: il report dice dove una delle due mani non ha ancora
 * scritto (sito effettuato / noi aperti; noi chiusi / sito senza esito), e chi corregge decide
 * guardandolo. Niente scritture automatiche dal file: il registro si chiude dai NOSTRI
 * rapportini (riconciliazione in /api/acea/ordini), e il sito si aggiorna solo dal sito —
 * questo confronto è il ponte che mancava fra i due, non un terzo scrittore.
 *
 * Multipart: `file` (.xls/.xlsx/.csv del sito, foglio con «Codice Esterno dell'OdL» ed «Esito»).
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }

  // Come il caricamento master: file in memoria, poche centinaia di righe attese.
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
    /*
      Il foglio si chiama «Esecuzione» nell'export reale, ma il nome non è un contratto: si
      preferisce quello, e in mancanza si prende il primo — il parser risolve comunque le
      colonne per nome e lancia se non sono quelle.
    */
    const nome = wb.SheetNames.find((n) => /esecuzion/i.test(n)) ?? wb.SheetNames[0];
    const ws = nome ? wb.Sheets[nome] : undefined;
    if (!ws) return NextResponse.json({ error: 'File vuoto o privo di fogli.' }, { status: 422 });
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  try {
    const { righe, totale } = parseEsecuzioni(rows);

    /*
      Il registro si riconcilia PRIMA di leggerlo, come sulla tabella: un confronto su righe
      non ancora riconciliate accusa «manca il nostro esito» a lavoro già consegnato — è
      successo il 04/08, 77 interventi eseguiti ma non ancora agganciati, e il contatore
      fermo a 84 qualunque cosa si facesse. Best-effort e throttled (vedi la funzione).
    */
    await riconciliaChiusureAcqualatina().catch((e) => {
      console.error('[acqualatina/esiti/confronto] riconciliazione non riuscita:', e);
    });

    const registro: RigaRegistroPerConfronto[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('odl, aperto, esito_positivo, stato_desc, data_completamento, impianto, nominativo, comune')
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as RigaRegistroPerConfronto[];
      registro.push(...blocco);
      if (blocco.length < PAGINA) break;
    }

    /*
      Gli ODL della GIORNATA IN CORSO: intervento di oggi non ancora concluso. La squadra
      registra live sul sito, il nostro rapportino arriva a fine giornata — accusarli come
      «manca il nostro esito» mentre gli operatori lavorano creava confusione in ufficio
      (decisione utente 04/08). Il confronto li conta a parte, senza elencarli.
    */
    const oggi = partiRoma(new Date()).oggi;
    const inLavorazione = new Set<string>();
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('interventi')
        .select('odl')
        .eq('committente', 'acqualatina')
        .eq('data', oggi)
        .not('stato', 'in', '(completato,annullato)')
        .not('odl', 'is', null)
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as Array<{ odl: string | null }>;
      for (const r of blocco) {
        const odl = String(r.odl ?? '').replace(/\s+/g, ' ').trim();
        if (odl !== '') inLavorazione.add(odl);
      }
      if (blocco.length < PAGINA) break;
    }

    const confronto = confrontaEsitiSito(righe, registro, inLavorazione, oggi);
    return NextResponse.json(
      { ...confronto, righeFile: totale },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Confronto non riuscito.';
    const nostro = e instanceof Error && /Codice Esterno/.test(e.message);
    if (!nostro) console.error('[acqualatina/esiti/confronto] fallito:', e);
    return NextResponse.json({ error: msg }, { status: nostro ? 422 : 500 });
  }
}
