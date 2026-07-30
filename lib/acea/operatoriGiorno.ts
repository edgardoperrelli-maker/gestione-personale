import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isAssenzaIntera, isNomeAttivitaAssenza } from '@/lib/disponibilita';
import { giorniProgrammabili, giornoEsteso, spiegaFinestra } from './giorniProgrammabili';

/**
 * Chi si può mandare su un ordine ACEA in un dato giorno.
 *
 * Non è l'anagrafica del personale: è il CRONOPROGRAMMA. Chi programma ACEA la mattina deve vedere
 * i nomi che qualcun altro ha già messo in tabellone per oggi e per domani — sono le persone che
 * quel giorno ci sono davvero. L'elenco completo degli attivi conteneva anche chi è in ferie, chi
 * è su un'altra commessa e chi non è ancora stato messo in tabellone: trenta nomi da cui sceglierne
 * otto, e nessun modo di sapere quali otto se non chiedendo.
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
  staff: { id?: string; display_name?: string } | Array<{ id?: string; display_name?: string }> | null;
  territory: { name?: string } | Array<{ name?: string }> | null;
  activity: { name?: string } | Array<{ name?: string }> | null;
};

const primo = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

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
    .select('day_id, staff_id, staff:staff_id ( id, display_name ), territory:territory_id ( name ), activity:activity_id ( name )')
    .in('day_id', [...dataDelGiorno.keys()]);
  if (error) throw error;

  // Assenze intere del periodo: una sola lettura per tutte le date richieste.
  const assenti = new Set<string>();
  const { data: disp } = await supabaseAdmin
    .from('disponibilita_operatore')
    .select('staff_id, data, ora_da, ora_a')
    .in('data', date as string[]);
  for (const a of (disp ?? []) as Array<{ staff_id: string; data: string; ora_da: string | null; ora_a: string | null }>) {
    if (isAssenzaIntera(a)) assenti.add(`${a.data}|${a.staff_id}`);
  }

  // Dedup per (giorno, operatore): una persona può avere più righe di tabellone nello stesso
  // giorno — squadre, attività multiple — e nel menu deve comparire una volta sola.
  const visti = new Set<string>();
  for (const r of (righe ?? []) as RigaAssegnazione[]) {
    const data = dataDelGiorno.get(r.day_id);
    if (!data || !r.staff_id) continue;
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

/**
 * Motivo del rifiuto di una coppia (giorno, operatore), o `null` se si può scrivere.
 *
 * Sta sul SERVER e non solo nel menu perché una regola applicata alla sola UI è decorativa: la
 * griglia accetta un incolla da Excel, e senza questo controllo un blocco incollato scriverebbe
 * qualunque data e qualunque operatore. Le due rotte che pianificano — `/pianifica` e `/celle` —
 * passano entrambe di qui, così non possono divergere.
 */
export async function controllaAssegnazioni(
  coppie: readonly { data: string; staffId: string }[],
  oggi: string,
): Promise<Map<string, string>> {
  const motivi = new Map<string, string>();
  if (coppie.length === 0) return motivi;

  const ammessi = new Set(giorniProgrammabili(oggi).map((g) => g.data));
  const dateDaLeggere = [...new Set(coppie.map((c) => c.data))].filter((d) => ammessi.has(d));
  const perGiorno = dateDaLeggere.length > 0
    ? await operatoriPerGiorno(dateDaLeggere)
    : new Map<string, OperatoreGiorno[]>();

  for (const c of coppie) {
    const chiave = `${c.data}|${c.staffId}`;
    if (motivi.has(chiave)) continue;
    if (!ammessi.has(c.data)) {
      motivi.set(chiave, `${giornoEsteso(c.data)} è fuori finestra: ${spiegaFinestra(oggi)}`);
      continue;
    }
    const lista = perGiorno.get(c.data) ?? [];
    if (!lista.some((o) => o.id === c.staffId)) {
      motivi.set(
        chiave,
        lista.length === 0
          ? `nessun operatore in cronoprogramma per ${giornoEsteso(c.data)}`
          : `operatore non in cronoprogramma per ${giornoEsteso(c.data)}`,
      );
    }
  }
  return motivi;
}
