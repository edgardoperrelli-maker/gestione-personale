import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAssenzaIntera, isNomeAttivitaAssenza } from '@/lib/disponibilita';
import { giorniProgrammabili, giornoEsteso, spiegaFinestra } from './giorniProgrammabili';

/**
 * Chi si può mandare su un ordine ACEA in un dato giorno.
 *
 * Non è l'anagrafica del personale: è il CRONOPROGRAMMA, e non tutto il cronoprogramma — solo chi
 * quel giorno ha l'ATTIVITÀ DI DUNNING in tabellone. Il tabellone intero conteneva Firenze,
 * Napoli e Perugia su tutt'altre commesse: trenta nomi da cui sceglierne quattro, e nessun modo
 * di sapere quali quattro se non chiedendo.
 *
 * Il criterio è l'attività, NON il territorio, ed è il punto: chi sta su LAZIO CENTRO o LAZIO EST
 * con il dunning aggiunto alle sue attività (`activity_ids`) deve comparire — è chi «prende
 * qualche intervento di dunning per saturare la giornata». Filtrare per territorio ACEA lo
 * avrebbe nascosto.
 */
export type OperatoreGiorno = {
  id: string;
  display_name: string;
  /** Territorio del cronoprogramma, quando c'è: aiuta a scegliere l'operatore più vicino. */
  territorio: string | null;
};

export type GiornoConOperatori = {
  data: string;
  etichetta: string;
  esteso: string;
  operatori: OperatoreGiorno[];
};

type RigaAssegnazione = {
  day_id: string;
  staff_id: string | null;
  activity_id: string | null;
  /** Attività multiple della riga di tabellone (gruppi attività): il dunning spesso sta qui. */
  activity_ids: string[] | null;
  staff: { id?: string; display_name?: string } | Array<{ id?: string; display_name?: string }> | null;
  territory: { name?: string } | Array<{ name?: string }> | null;
  activity: { name?: string } | Array<{ name?: string }> | null;
};

const primo = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Frammenti di nome che rendono un'attività di tabellone «di dunning».
 *
 * Per NOME e non per id: l'id è un uuid di produzione e cablarlo qui legherebbe il codice a un
 * database. Oggi l'attività si chiama «DUNNING»; se un domani se ne aggiunge una («ACEA
 * DUNNING», …) basta che il nome contenga il frammento.
 */
const ATTIVITA_DUNNING = ['DUNNING'];

const eNomeDunning = (nome: string | null | undefined): boolean => {
  const n = String(nome ?? '').toUpperCase();
  return ATTIVITA_DUNNING.some((f) => n.includes(f));
};

/**
 * Gli operatori in cronoprogramma per ciascuna delle date richieste.
 *
 * Due sottrazioni, entrambe necessarie:
 *  - le righe di tabellone la cui ATTIVITÀ è un tipo di assenza (Ferie/104/Malattia/…): sono la
 *    vecchia forma delle assenze, ancora presente sui giorni passati e su chi la usa per abitudine;
 *  - chi ha un'assenza INTERA in `disponibilita_operatore`, che è la forma nuova. Le assenze
 *    parziali no: chi c'è mezza giornata un ordine lo può fare, e toglierlo dall'elenco
 *    significherebbe non poterglielo assegnare affatto.
 */
export async function operatoriPerGiorno(
  date: readonly string[],
): Promise<Map<string, OperatoreGiorno[]>> {
  const esito = new Map<string, OperatoreGiorno[]>();
  for (const d of date) esito.set(d, []);
  if (date.length === 0) return esito;

  const { data: giorni, error: erroreGiorni } = await supabaseAdmin
    .from('calendar_days')
    .select('id, day')
    .in('day', date as string[]);
  if (erroreGiorni) throw erroreGiorni;

  const dataDelGiorno = new Map<string, string>();
  for (const g of (giorni ?? []) as Array<{ id: string; day: string }>) {
    dataDelGiorno.set(g.id, g.day);
  }
  if (dataDelGiorno.size === 0) return esito;

  const { data: righe, error } = await supabaseAdmin
    .from('assignments')
    .select('day_id, staff_id, activity_id, activity_ids, staff:staff_id ( id, display_name ), territory:territory_id ( name ), activity:activity_id ( name )')
    .in('day_id', [...dataDelGiorno.keys()]);
  if (error) throw error;

  /*
    I nomi delle attività citate dalle righe, per decidere chi fa dunning.

    Il join `activity:activity_id` copre solo l'attività SINGOLA: il dunning di chi satura la
    giornata sta in `activity_ids`, che è un array di uuid senza join. Si risolvono per nome con
    una lettura sola, mirata agli id davvero citati.
  */
  const idAttivita = new Set<string>();
  for (const r of (righe ?? []) as RigaAssegnazione[]) {
    if (r.activity_id) idAttivita.add(r.activity_id);
    for (const id of r.activity_ids ?? []) if (id) idAttivita.add(id);
  }

  // Nomi attività e assenze sono indipendenti: partono insieme, non in fila. Questo elenco sta
  // sulla strada di OGNI salvataggio (controllaAssegnazioni) — ogni giro risparmiato si sente.
  const nomiAttivita = new Map<string, string>();
  const assenti = new Set<string>();
  await Promise.all([
    (async () => {
      if (idAttivita.size === 0) return;
      const { data: attivita, error: eAtt } = await supabaseAdmin
        .from('activities')
        .select('id, name')
        .in('id', [...idAttivita]);
      if (eAtt) throw eAtt;
      for (const a of (attivita ?? []) as Array<{ id: string; name: string | null }>) {
        nomiAttivita.set(a.id, a.name ?? '');
      }
    })(),
    (async () => {
      // Assenze intere del periodo: una sola lettura per tutte le date richieste.
      const { data: disp } = await supabaseAdmin
        .from('disponibilita_operatore')
        .select('staff_id, data, ora_da, ora_a')
        .in('data', date as string[]);
      for (const a of (disp ?? []) as Array<{ staff_id: string; data: string; ora_da: string | null; ora_a: string | null }>) {
        if (isAssenzaIntera(a)) assenti.add(`${a.data}|${a.staff_id}`);
      }
    })(),
  ]);

  const faDunning = (r: RigaAssegnazione): boolean =>
    (r.activity_id !== null && eNomeDunning(nomiAttivita.get(r.activity_id)))
    || (r.activity_ids ?? []).some((id) => eNomeDunning(nomiAttivita.get(id)));

  // Dedup per (giorno, operatore): una persona può avere più righe di tabellone nello stesso
  // giorno — squadre, attività multiple — e nel menu deve comparire una volta sola.
  const visti = new Set<string>();
  for (const r of (righe ?? []) as RigaAssegnazione[]) {
    const data = dataDelGiorno.get(r.day_id);
    if (!data || !r.staff_id) continue;
    // Solo chi fa DUNNING quel giorno: attività singola o una delle sue attività multiple.
    if (!faDunning(r)) continue;
    if (assenti.has(`${data}|${r.staff_id}`)) continue;
    if (isNomeAttivitaAssenza(primo(r.activity)?.name)) continue;
    const chiave = `${data}|${r.staff_id}`;
    if (visti.has(chiave)) continue;
    const nome = primo(r.staff)?.display_name;
    if (!nome) continue;
    visti.add(chiave);
    esito.get(data)?.push({
      id: r.staff_id,
      display_name: nome,
      territorio: primo(r.territory)?.name ?? null,
    });
  }

  for (const lista of esito.values()) {
    lista.sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
  }
  return esito;
}

/** I giorni programmabili con dentro i rispettivi operatori: una lettura sola per la pagina. */
export async function finestraProgrammabile(oggi: string): Promise<GiornoConOperatori[]> {
  const giorni = giorniProgrammabili(oggi);
  if (giorni.length === 0) return [];
  const perGiorno = await operatoriPerGiorno(giorni.map((g) => g.data));
  return giorni.map((g) => ({ ...g, operatori: perGiorno.get(g.data) ?? [] }));
}

export type AssegnazioneDaControllare = {
  data: string;
  staffId: string;
  /**
   * `true` se la DATA viene scritta adesso. `false` se si sta cambiando il solo esecutore su una
   * riga che la data ce l'aveva già.
   *
   * La distinzione è tutta la regola. Scegliere un giorno significa sottostare alla finestra e al
   * tabellone di quel giorno. Cambiare l'esecutore di un intervento vecchio e non eseguito non è
   * la stessa cosa: la data non la si sta scegliendo, e il cronoprogramma di un giorno passato non
   * ha nessuna autorità su chi ci va adesso. Senza questa distinzione un lavoro rimasto indietro
   * non si poteva più riassegnare senza prima spostarlo.
   */
  dataScritta: boolean;
};

/**
 * Motivo del rifiuto di un'assegnazione, o assente se si può scrivere. Chiave `${data}|${staffId}`.
 *
 * Sta sul SERVER e non solo nel menu perché una regola applicata alla sola UI è decorativa: la
 * griglia accetta un incolla da Excel, e senza questo controllo un blocco incollato scriverebbe
 * qualunque data e qualunque operatore. Le due rotte che pianificano — `/pianifica` e `/celle` —
 * passano entrambe di qui, così non possono divergere.
 */
export async function controllaAssegnazioni(
  assegnazioni: readonly AssegnazioneDaControllare[],
  oggi: string,
): Promise<Map<string, string>> {
  const motivi = new Map<string, string>();
  if (assegnazioni.length === 0) return motivi;

  const ammessi = new Set(giorniProgrammabili(oggi).map((g) => g.data));
  /*
    Il tabellone si legge solo per i giorni su cui si sta davvero scegliendo.

    Una data fuori finestra che NON viene scritta (si cambia il solo esecutore su un intervento
    vecchio) passa senza controlli: non si sta decidendo quel giorno, lo si sta ereditando.
  */
  const daControllare = assegnazioni.filter((a) => a.dataScritta || ammessi.has(a.data));
  const dateDaLeggere = [...new Set(daControllare.map((a) => a.data))].filter((d) => ammessi.has(d));
  const perGiorno = dateDaLeggere.length > 0
    ? await operatoriPerGiorno(dateDaLeggere)
    : new Map<string, OperatoreGiorno[]>();

  for (const a of daControllare) {
    const chiave = `${a.data}|${a.staffId}`;
    if (motivi.has(chiave)) continue;
    if (!ammessi.has(a.data)) {
      motivi.set(chiave, `${giornoEsteso(a.data)} è fuori finestra: ${spiegaFinestra(oggi)}`);
      continue;
    }
    const lista = perGiorno.get(a.data) ?? [];
    if (!lista.some((o) => o.id === a.staffId)) {
      motivi.set(
        chiave,
        lista.length === 0
          ? `nessun operatore con attività DUNNING in cronoprogramma per ${giornoEsteso(a.data)}`
          : `operatore senza attività DUNNING in cronoprogramma per ${giornoEsteso(a.data)}`,
      );
    }
  }
  return motivi;
}
