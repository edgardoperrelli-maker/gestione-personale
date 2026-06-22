import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { assegnabiliAcea, type InterventoAcea } from '@/lib/agente/assegnabiliAcea';

export const runtime = 'nodejs';

// Sorgente: righe lette dal file (agente_pianificabili) dei file di committente ACEA per quel giorno.
// È INDIPENDENTE da "Procedi"/rapportini: serve solo aver fatto "Leggi dal file". Il driver ACEA
// aggancia l'operatore per COGNOME, che è già l'`esecutore` del master → nessuna risoluzione staff.
export async function GET(req: Request) {
  if (!chiaveValida(req)) return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: 'data obbligatoria (YYYY-MM-DD).' }, { status: 400 });

  try {
    // file di committente ACEA assegnabili sul Cruscotto "Pianificazione Lavori".
    // ESCLUDE l'attività "LIMITAZIONI MASSIVE" (ZAGAROLO): NON va assegnata qui — è un flusso diverso.
    const { data: cfgRows } = await supabaseAdmin.from('agente_file_config').select('file, committente, attivita');
    const aceaFiles = new Set(
      ((cfgRows ?? []) as { file: string; committente: string; attivita: string | null }[])
        .filter((c) => c.committente === 'acea' && c.attivita !== 'LIMITAZIONI MASSIVE')
        .map((c) => c.file),
    );

    // Filtro per ODL SELEZIONATI nell'anteprima (acea_assegna_odls): se valorizzato, si assegnano
    // SOLO quegli ODL (sottoinsieme del giorno). null/vuoto = tutto il giorno (retro-compatibile).
    const { data: cfgRow } = await supabaseAdmin
      .from('agente_config')
      .select('acea_assegna_odls')
      .eq('id', 1)
      .maybeSingle();
    const odlSelRaw = (cfgRow as { acea_assegna_odls?: unknown } | null)?.acea_assegna_odls;
    const odlSel = Array.isArray(odlSelRaw) && odlSelRaw.length > 0
      ? new Set(odlSelRaw.map((x) => String(x)))
      : null;

    // righe lette dal file per quel giorno (solo file ACEA), eventualmente ristrette agli ODL selezionati
    const { data: pianRaw, error: ePian } = await supabaseAdmin
      .from('agente_pianificabili')
      .select('id, file, odl, matricola, indirizzo, comune, esecutore, stato_odl')
      .eq('data', data);
    if (ePian) throw ePian;
    const pian = ((pianRaw ?? []) as Array<{ id: string; file: string; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; esecutore: string | null; stato_odl: string | null }>)
      .filter((r) => aceaFiles.has(r.file) && (!odlSel || (r.odl != null && odlSel.has(String(r.odl)))));

    // adatta alla forma usata da assegnabiliAcea: staff_id = esecutore (cognome), staffById = identità
    const interventi: InterventoAcea[] = pian.map((r) => ({
      id: r.id, odl: r.odl, matricola_contatore: r.matricola, indirizzo: r.indirizzo, comune: r.comune, staff_id: r.esecutore,
      stato_odl: r.stato_odl,
    }));
    const staffById: Record<string, string> = {};
    for (const r of pian) { const e = (r.esecutore ?? '').trim(); if (e) staffById[e] = e; }

    // odl già assegnati (reali) per quel giorno → idempotenza
    const { data: logRows } = await supabaseAdmin
      .from('acea_assegnazioni_log')
      .select('odl').eq('data_assegnazione', data).eq('esito', 'assegnato').eq('dry_run', false);
    const odlGia = new Set(((logRows ?? []) as { odl: string }[]).map((r) => r.odl));

    const { righe, scartati } = assegnabiliAcea(interventi, staffById, odlGia);
    return NextResponse.json({ data, righe, scartati }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore acea-assegnazioni.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
