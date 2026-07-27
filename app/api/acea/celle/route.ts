import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  pianoPianificazione, type InterventoEsistente, type OrdineDaPianificare,
} from '@/lib/acea/pianificazione';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { tassonomiaAttivitaAcea, COMMITTENTE_ACEA } from '@/lib/acea/tassonomiaAcea';

export const runtime = 'nodejs';

/** Una cella modificata: la riga (chiave ordine) e il nuovo stato di pianificazione. */
type Modifica = {
  chiave: string;            // `odl|numero_operazione`
  staffId?: string | null;   // assente = invariato
  data?: string | null;      // assente = invariato
};

type Corpo = { modifiche?: Modifica[] };

/**
 * POST /api/acea/celle — applica le modifiche fatte in griglia su `Esecutore` e `Data pianificata`.
 *
 * Rispetto a `/api/acea/pianifica` (che assegna lo STESSO operatore e giorno a un blocco), qui
 * ogni riga può avere valori diversi: è l'incolla di una colonna intera da Excel. Le invarianti
 * sono le stesse — non si duplica, non si sposta il completato — e vengono dalla stessa funzione
 * pura, così i due percorsi non possono divergere.
 *
 * Registra un'operazione annullabile come la pianificazione in blocco.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { modifiche } = (await req.json()) as Corpo;
    const lista = (Array.isArray(modifiche) ? modifiche : []).filter((m) => m && m.chiave);
    if (lista.length === 0) {
      return NextResponse.json({ error: 'Nessuna modifica.' }, { status: 400 });
    }

    const odlTutti = [...new Set(lista.map((m) => m.chiave.split('|')[0]))];

    // Registro e interventi correnti: si decide sul dato del server, non su quello del client.
    const ordiniPerChiave = new Map<string, OrdineDaPianificare>();
    for (let i = 0; i < odlTutti.length; i += 200) {
      const blocco = odlTutti.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('acea_ordini')
        .select('id, odl, numero_operazione, aperto, attivita, comune, via, civico, cap, matricola')
        .in('odl', blocco);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
        ordiniPerChiave.set(`${String(r.odl)}|${String(r.numero_operazione)}`, {
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

    const esistenti: InterventoEsistente[] = [];
    for (let i = 0; i < odlTutti.length; i += 200) {
      const blocco = odlTutti.slice(i, i + 200);
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
    const interventoPerOdl = new Map<string, InterventoEsistente[]>();
    for (const i of esistenti) {
      interventoPerOdl.set(i.odl, [...(interventoPerOdl.get(i.odl) ?? []), i]);
    }

    let indice: Map<string, TassonomiaRiga> | null = null;
    try {
      indice = buildTassonomiaIndex(await caricaTassonomia());
    } catch {
      indice = null;
    }

    const azioniLog: Array<Record<string, unknown>> = [];
    const rifiutate: Array<{ chiave: string; motivo: string }> = [];
    let creati = 0;
    let aggiornati = 0;

    for (const m of lista) {
      const ordine = ordiniPerChiave.get(m.chiave);
      if (!ordine) {
        rifiutate.push({ chiave: m.chiave, motivo: 'ordine non trovato' });
        continue;
      }
      const apertiSuOdl = (interventoPerOdl.get(ordine.odl) ?? []).filter((i) => i.stato !== 'annullato');
      const corrente = [...apertiSuOdl].sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;

      // Valori finali: quello che arriva, oppure quello che c'è già.
      const dataFinale = m.data ?? corrente?.data ?? null;
      const staffFinale = m.staffId ?? corrente?.staff_id ?? null;
      if (!dataFinale || !staffFinale) {
        // Una cella sola su una riga mai pianificata non basta a creare l'intervento: servono
        // entrambi. Non è un errore, è una riga incompleta — si dice e si va avanti.
        rifiutate.push({ chiave: m.chiave, motivo: 'servono sia operatore sia data' });
        continue;
      }

      // Stesse invarianti della pianificazione in blocco: stessa funzione pura, nessuna divergenza.
      const piano = pianoPianificazione({
        ordini: [ordine],
        esistenti: apertiSuOdl.concat(
          (interventoPerOdl.get(ordine.odl) ?? []).filter((i) => i.stato === 'completato'),
        ),
        data: dataFinale,
        staffId: staffFinale,
      });
      const azione = piano.azioni[0];
      if (!azione) continue;                                   // già così: nulla da fare
      if (azione.tipo === 'salta') {
        rifiutate.push({
          chiave: m.chiave,
          motivo: azione.motivo === 'ordine_chiuso'
            ? 'ordine già chiuso su ACEA'
            : 'intervento già completato',
        });
        continue;
      }

      if (azione.tipo === 'aggiorna') {
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({ data: dataFinale, staff_id: staffFinale, stato: 'assegnato' })
          .eq('id', azione.interventoId);
        if (error) throw error;
        aggiornati++;
        azioniLog.push({
          odl: ordine.odl, numero_operazione: ordine.numero_operazione,
          azione: 'aggiornato', intervento_id: azione.interventoId, prima: azione.prima,
        });
        continue;
      }

      const tass = tassonomiaAttivitaAcea(ordine.attivita, indice);
      const { data: creato, error } = await supabaseAdmin
        .from('interventi')
        .insert({
          committente: COMMITTENTE_ACEA,
          odl: ordine.odl,
          ordine_id: ordine.ordine_id,
          data: dataFinale,
          staff_id: staffFinale,
          stato: 'assegnato',
          assegnato_at: new Date().toISOString(),
          intervento_tipo: tass.tipo,
          gruppo_attivita: tass.gruppo,
          matricola_contatore: ordine.matricola,
          indirizzo: [ordine.via, ordine.civico].filter(Boolean).join(' ') || null,
          comune: ordine.comune,
          cap: ordine.cap,
        })
        .select('id')
        .single();
      if (error) throw error;
      creati++;
      azioniLog.push({
        odl: ordine.odl, numero_operazione: ordine.numero_operazione,
        azione: 'creato', intervento_id: creato?.id ?? null, prima: null,
      });
    }

    let operazioneId: string | null = null;
    if (azioniLog.length > 0) {
      const { data: op, error } = await supabaseAdmin
        .from('acea_operazioni')
        .insert({
          tipo: 'pianifica',
          attore: auth.user.id,
          dettaglio: { origine: 'griglia', azioni: azioniLog },
        })
        .select('id')
        .single();
      if (error) throw error;
      operazioneId = (op?.id as string) ?? null;
    }

    return NextResponse.json(
      { operazioneId, creati, aggiornati, rifiutate },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore modifica celle.' },
      { status: 500 },
    );
  }
}
