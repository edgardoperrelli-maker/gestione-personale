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
import { controllaAssegnazioni } from '@/lib/acea/operatoriGiorno';
import { MOTIVO_SOLO_ATTIVAZIONI, soloAttivazioni } from '@/lib/acea/giorniProgrammabili';
import { eRiapertura } from '@/lib/acea/scadenza';
import { partiRoma } from '@/lib/agente/orarioRoma';

export const runtime = 'nodejs';

/** Una cella modificata: la riga (chiave ordine) e il nuovo stato di pianificazione. */
type Modifica = {
  chiave: string;            // `odl|numero_operazione`
  staffId?: string | null;   // assente = invariato
  data?: string | null;      // assente = invariato
  /**
   * Nota dell'ufficio. Assente = invariata; stringa vuota = cancellata.
   *
   * Va su `acea_ordini` e non su `interventi` come le altre due, perché si deve poter scrivere
   * PRIMA che l'ordine sia pianificato: è il momento in cui si annota «citofonare interno 4»,
   * cioè mentre si guarda la riga, non dopo averla assegnata.
   */
  nota?: string | null;
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

    /*
      Le NOTE si scrivono subito e per conto loro: non sono pianificazione, non creano interventi,
      non hanno invarianti da rispettare. Tenerle in questo percorso — e non in una rotta a sé —
      serve a far passare un incolla misto (esecutore, data e note insieme) come una richiesta
      sola, che è come l'utente lo vive.
    */
    let noteScritte = 0;
    for (const m of lista) {
      if (m.nota === undefined) continue;
      const [odl, operazione] = m.chiave.split('|');
      const { error } = await supabaseAdmin
        .from('acea_ordini')
        // Vuoto = cancellata: `null` e non stringa vuota, così «senza nota» ha una forma sola.
        .update({ note: (m.nota ?? '').trim() === '' ? null : m.nota })
        .eq('odl', odl)
        .eq('numero_operazione', operazione);
      if (error) throw error;
      noteScritte += 1;
    }
    // Solo note: non c'è pianificazione da toccare, e si evita di aprire un'operazione annullabile
    // vuota che comparirebbe nello storico come se avesse spostato qualcosa.
    if (lista.every((m) => m.staffId === undefined && m.data === undefined)) {
      return NextResponse.json({
        operazioneId: null, creati: 0, aggiornati: noteScritte, rifiutate: [], bozze: 0,
      });
    }

    // Registro e interventi correnti: si decide sul dato del server, non su quello del client.
    const ordiniPerChiave = new Map<string, OrdineDaPianificare>();
    /** Appunti già presenti sulla riga: `pianificato_*_bozza`, la mezza pianificazione. */
    const bozzePerChiave = new Map<string, { staffId: string | null; data: string | null }>();
    for (let i = 0; i < odlTutti.length; i += 200) {
      const blocco = odlTutti.slice(i, i + 200);
      const { data: righe, error } = await supabaseAdmin
        .from('acea_ordini')
        .select('id, odl, numero_operazione, aperto, attivita, comune, via, civico, cap, matricola, codice_sla, pianificato_a_bozza, pianificato_il_bozza')
        .in('odl', blocco);
      if (error) throw error;
      for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
        const chiave = `${String(r.odl)}|${String(r.numero_operazione)}`;
        ordiniPerChiave.set(chiave, {
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
          riapertura: eRiapertura(r.codice_sla as string | null),
        });
        bozzePerChiave.set(chiave, {
          staffId: (r.pianificato_a_bozza as string | null) ?? null,
          data: (r.pianificato_il_bozza as string | null) ?? null,
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

    /*
      Prima passata: lo STATO FINALE di ogni riga, senza scrivere niente.

      Serve a chiedere la finestra e il cronoprogramma una volta sola invece che riga per riga —
      un incolla può portare centinaia di righe, e un controllo dentro il ciclo sarebbe una lettura
      del tabellone per ciascuna.

      `dataScritta` distingue i due gesti che qui si somigliano. Scegliere un giorno significa
      sottostare alla finestra e al tabellone di quel giorno; cambiare il solo esecutore di un
      intervento vecchio e non eseguito no — la data non la si sta scegliendo, la si eredita, e il
      cronoprogramma di un giorno passato non ha nessuna autorità su chi ci va adesso.
    */
    type StatoFinale = { data: string; staffId: string; dataScritta: boolean };
    const finali = new Map<string, StatoFinale>();
    for (const m of lista) {
      const ordine = ordiniPerChiave.get(m.chiave);
      if (!ordine) continue;
      const aperti = (interventoPerOdl.get(ordine.odl) ?? []).filter((i) => i.stato !== 'annullato');
      const corrente = [...aperti].sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;
      const bozza = bozzePerChiave.get(m.chiave);
      const data = m.data ?? corrente?.data ?? bozza?.data ?? null;
      const staffId = m.staffId ?? corrente?.staff_id ?? bozza?.staffId ?? null;
      if (!data || !staffId) continue;
      // Senza un intervento esistente il giorno lo si sta SCEGLIENDO adesso, che arrivi
      // dall'incolla o da un appunto lasciato prima: in entrambi i casi la finestra vale.
      finali.set(m.chiave, { data, staffId, dataScritta: m.data !== undefined || corrente === null });
    }
    const oggi = partiRoma(new Date()).oggi;
    const motiviFinestra = await controllaAssegnazioni([...finali.values()], oggi);

    /** Righe rimaste a metà: si scrivono come APPUNTO, non come intervento. */
    const appunti: Array<{ chiave: string; staffId?: string | null; data?: string | null }> = [];
    /** Righe completate ora: l'appunto ha esaurito il suo compito e va tolto. */
    const appuntiDaPulire: string[] = [];

    for (const m of lista) {
      const ordine = ordiniPerChiave.get(m.chiave);
      if (!ordine) {
        rifiutate.push({ chiave: m.chiave, motivo: 'ordine non trovato' });
        continue;
      }
      const apertiSuOdl = (interventoPerOdl.get(ordine.odl) ?? []).filter((i) => i.stato !== 'annullato');

      const finale = finali.get(m.chiave);
      if (!finale) {
        /*
          Una cella sola su una riga mai pianificata non basta a creare l'intervento — `data` è
          NOT NULL e senza operatore non c'è nessuno a cui mandare il rapportino — ma non è più un
          rifiuto: si scrive come APPUNTO su `acea_ordini`, e la riga resta in tabella con il
          valore in corsivo. Prima si perdeva: chi sapeva già a chi darlo, ma non ancora quando,
          si vedeva rifiutare la scrittura e riscriveva a mano su un foglio.

          La rete che lo rende sicuro sta nel motore rapportini: un giorno con righe a metà si
          rifiuta di generare finché non lo si conferma.
        */
        if (m.staffId !== undefined || m.data !== undefined) {
          appunti.push({ chiave: m.chiave, staffId: m.staffId, data: m.data });
        }
        continue;
      }
      const { data: dataFinale, staffId: staffFinale } = finale;

      const fuoriFinestra = motiviFinestra.get(`${dataFinale}|${staffFinale}`);
      if (fuoriFinestra) {
        rifiutate.push({ chiave: m.chiave, motivo: fuoriFinestra });
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
        soloAttivazioni: soloAttivazioni(dataFinale),
      });
      const azione = piano.azioni[0];
      if (!azione) continue;                                   // già così: nulla da fare
      if (azione.tipo === 'salta') {
        rifiutate.push({
          chiave: m.chiave,
          motivo: azione.motivo === 'ordine_chiuso'
            ? 'ordine già chiuso su ACEA'
            : azione.motivo === 'solo_attivazioni'
              ? MOTIVO_SOLO_ATTIVAZIONI
              : 'intervento già completato',
        });
        continue;
      }

      // Da qui in giù la riga diventa un intervento vero: l'appunto, se c'era, ha finito.
      const bozza = bozzePerChiave.get(m.chiave);
      if (bozza && (bozza.staffId || bozza.data)) appuntiDaPulire.push(m.chiave);

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

    /*
      Gli appunti, dopo gli interventi.

      Dopo, e non dentro il ciclo, per una ragione sola: una riga può prima ricevere un appunto e
      poi essere completata dallo stesso incolla (si incollano esecutore e data insieme). Scrivendo
      man mano, l'appunto sarebbe finito su una riga che nel frattempo è diventata un intervento —
      e sarebbe rimasto lì a far bloccare i rapportini per una riga a posto.
    */
    let bozze = 0;
    for (const a of appunti) {
      const [odl, operazione] = a.chiave.split('|');
      const patch: Record<string, string | null> = {};
      if (a.staffId !== undefined) patch.pianificato_a_bozza = a.staffId || null;
      if (a.data !== undefined) patch.pianificato_il_bozza = a.data || null;
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabaseAdmin
        .from('acea_ordini')
        .update(patch)
        .eq('odl', odl)
        .eq('numero_operazione', operazione);
      if (error) throw error;
      bozze += 1;
    }

    for (const chiave of appuntiDaPulire) {
      const [odl, operazione] = chiave.split('|');
      const { error } = await supabaseAdmin
        .from('acea_ordini')
        .update({ pianificato_a_bozza: null, pianificato_il_bozza: null })
        .eq('odl', odl)
        .eq('numero_operazione', operazione);
      if (error) throw error;
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
      { operazioneId, creati, aggiornati, rifiutate, bozze },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore modifica celle.' },
      { status: 500 },
    );
  }
}
