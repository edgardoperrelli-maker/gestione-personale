import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  pianoPianificazione, etichettaMotivo,
  type InterventoEsistente, type OrdineDaPianificare,
} from '@/lib/acea/pianificazione';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { tassonomiaAttivitaAcea, COMMITTENTE_ACEA } from '@/lib/acea/tassonomiaAcea';

export const runtime = 'nodejs';

type Corpo = {
  /** Chiavi `odl|numero_operazione` delle righe selezionate. */
  chiavi?: string[];
  data?: string;
  staffId?: string;
};

/**
 * POST /api/acea/pianifica — assegna operatore e giorno alle righe selezionate.
 *
 * Restituisce un `operazioneId` con cui l'azione può essere annullata: prima di scrivere si
 * registra lo stato precedente di ogni riga toccata.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json()) as Corpo;
    const chiavi = Array.isArray(corpo.chiavi) ? corpo.chiavi : [];
    const data = String(corpo.data ?? '');
    const staffId = String(corpo.staffId ?? '');

    if (chiavi.length === 0) {
      return NextResponse.json({ error: 'Nessuna riga selezionata.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: 'Data non valida (YYYY-MM-DD).' }, { status: 400 });
    }
    if (!staffId) {
      return NextResponse.json({ error: 'Operatore mancante.' }, { status: 400 });
    }

    // 1) Ordini selezionati, letti dal registro (non dal client: il client potrebbe avere una
    //    fotografia vecchia, e su questi dati si decide chi va dove).
    const odlSelezionati = [...new Set(chiavi.map((k) => k.split('|')[0]))];
    const ordini: OrdineDaPianificare[] = [];
    for (let i = 0; i < odlSelezionati.length; i += 200) {
      const blocco = odlSelezionati.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('acea_ordini')
        .select('id, odl, numero_operazione, aperto, attivita, comune, via, civico, cap, matricola')
        .in('odl', blocco);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
        const chiave = `${String(r.odl)}|${String(r.numero_operazione)}`;
        if (!chiavi.includes(chiave)) continue;
        ordini.push({
          odl: String(r.odl),
          numero_operazione: String(r.numero_operazione),
          ordine_id: (r.id as string | null) ?? null,
          aperto: r.aperto === true,
          attivita: (r.attivita as string | null) ?? null,
          comune: (r.comune as string | null) ?? null,
          via: (r.via as string | null) ?? null,
          civico: (r.civico as string | null) ?? null,
          cap: (r.cap as string | null) ?? null,
          matricola: (r.matricola as string | null) ?? null,
        });
      }
    }
    if (ordini.length === 0) {
      return NextResponse.json({ error: 'Nessun ordine trovato nel registro.' }, { status: 404 });
    }

    // 2) Interventi già esistenti su quegli ODL (qualunque data): servono a spostare invece di
    //    duplicare, e a non toccare il lavoro già completato.
    const esistenti: InterventoEsistente[] = [];
    for (let i = 0; i < odlSelezionati.length; i += 200) {
      const blocco = odlSelezionati.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl, data, staff_id, stato')
        .in('odl', blocco)
        .in('committente', ['acea', 'lim_massive']);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
        if (!r.odl) continue;
        esistenti.push({
          id: String(r.id), odl: String(r.odl), data: String(r.data ?? ''),
          staff_id: (r.staff_id as string | null) ?? null, stato: String(r.stato ?? ''),
        });
      }
    }

    const piano = pianoPianificazione({ ordini, esistenti, data, staffId });

    // 3) Tassonomia: descrizione canonica e gruppo dell'attività (vedi lib/acea/tassonomiaAcea.ts
    //    per il motivo per cui serve l'alias di scrittura). Best-effort: senza tassonomia
    //    l'intervento nasce comunque con l'attività grezza.
    let indice: Map<string, TassonomiaRiga> | null = null;
    try {
      indice = buildTassonomiaIndex(await caricaTassonomia());
    } catch {
      indice = null;
    }

    // 4) Scritture + registrazione dello stato precedente per l'annullamento.
    const azioniLog: Array<Record<string, unknown>> = [];
    let creati = 0;
    let aggiornati = 0;

    for (const a of piano.azioni) {
      if (a.tipo === 'salta') continue;
      if (a.tipo === 'aggiorna') {
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({ data, staff_id: staffId, stato: 'assegnato', assegnato_at: new Date().toISOString() })
          .eq('id', a.interventoId);
        if (error) throw error;
        aggiornati++;
        azioniLog.push({
          odl: a.ordine.odl, numero_operazione: a.ordine.numero_operazione,
          azione: 'aggiornato', intervento_id: a.interventoId, prima: a.prima,
        });
        continue;
      }
      const tass = tassonomiaAttivitaAcea(a.ordine.attivita, indice);
      const { data: creato, error } = await supabaseAdmin
        .from('interventi')
        .insert({
          committente: COMMITTENTE_ACEA,
          odl: a.ordine.odl,
          ordine_id: a.ordine.ordine_id,
          data,
          staff_id: staffId,
          stato: 'assegnato',
          assegnato_at: new Date().toISOString(),
          intervento_tipo: tass.tipo,
          gruppo_attivita: tass.gruppo,
          matricola_contatore: a.ordine.matricola,
          indirizzo: [a.ordine.via, a.ordine.civico].filter(Boolean).join(' ') || null,
          comune: a.ordine.comune,
          cap: a.ordine.cap,
        })
        .select('id')
        .single();
      if (error) throw error;
      creati++;
      azioniLog.push({
        odl: a.ordine.odl, numero_operazione: a.ordine.numero_operazione,
        azione: 'creato', intervento_id: creato?.id ?? null, prima: null,
      });
    }

    // 5) L'operazione si registra solo se qualcosa è stato scritto: un'operazione vuota nello
    //    storico farebbe annullare "l'ultima azione" senza che ce ne sia una.
    let operazioneId: string | null = null;
    if (azioniLog.length > 0) {
      const { data: op, error } = await supabaseAdmin
        .from('acea_operazioni')
        .insert({
          tipo: 'pianifica',
          attore: auth.user.id,
          dettaglio: { data, staff_id: staffId, azioni: azioniLog },
        })
        .select('id')
        .single();
      if (error) throw error;
      operazioneId = (op?.id as string) ?? null;
    }

    return NextResponse.json({
      operazioneId,
      creati,
      aggiornati,
      invariati: piano.azioni.length === 0 ? ordini.length : ordini.length - piano.azioni.length,
      saltati: piano.azioni
        .filter((a): a is Extract<typeof a, { tipo: 'salta' }> => a.tipo === 'salta')
        .map((a) => ({
          odl: a.ordine.odl,
          numero_operazione: a.ordine.numero_operazione,
          motivo: etichettaMotivo(a.motivo),
        })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore pianificazione.' },
      { status: 500 },
    );
  }
}
