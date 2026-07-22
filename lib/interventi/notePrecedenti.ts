// PURA: note "tramandate" tra interventi sullo stesso impianto.
// Regola di business: quando un intervento viene chiuso POSITIVO con una nota nel
// rapportino (risposte.note), quella nota va mostrata all'operatore che riceve un
// futuro intervento sullo stesso impianto (es. limitazione → riapertura: "il
// misuratore si trova in realtà in via X"). L'aggancio è per impianto, NON per ODL:
// un ODL positivo è definitivamente chiuso (lib/interventi/odlPositivi.ts) e la
// riapertura arriva con un ODL nuovo ma stessa matricola/PDR.
//
// Decisioni di dominio (design condiviso 2026-07-22):
//   1. sorgente = campo `note` del rapportino (nessuna nuova UI di scrittura, no SQL);
//   2. solo interventi con esito 'eseguito_positivo' e nota compilata;
//   3. match per matricola OPPURE PDR;
//   4. confinato allo STESSO committente (una nota ACEA non tramanda a un intervento Italgas);
//   5/7. UI: modale + banner + spia (fuori da questo modulo);
//   6. tutte le note, cap alle 3 più recenti.

/** Riga minima di un intervento precedente candidato (esito = eseguito_positivo). */
export type InterventoPrecedenteRow = {
  id: string;
  committente: string | null;
  data: string | null; // YYYY-MM-DD
  matricola_contatore: string | null;
  pdr: string | null;
  intervento_tipo: string | null;
  staff_id: string | null;
};

/** Nota tramandata da un intervento precedente, pronta per il rendering. */
export type NotaPrecedente = {
  interventoId: string;
  testo: string;
  /** Data intervento (YYYY-MM-DD) — può mancare su dati storici. */
  data: string | null;
  /** Data già formattata per display IT (DD/MM/YYYY) o '' se assente. */
  dataLabel: string;
  attivita: string | null;
  operatore: string | null;
};

/** Chiavi impianto di una voce del rapportino corrente. */
export type VoceChiaviImpianto = {
  id: string;
  /** Committente dell'intervento corrente: la nota tramanda solo entro lo stesso committente. */
  committente?: string | null;
  matricola?: string | null;
  pdr?: string | null;
  /** Intervento collegato alla voce stessa: mai proposto come "precedente". */
  interventoId?: string | null;
};

/** Massimo numero di note mostrate per voce (le più recenti). */
export const MAX_NOTE_PRECEDENTI = 3;

/** Lunghezza minima perché una chiave (matricola/PDR) sia considerata identificante:
 *  evita di agganciare impianti diversi su placeholder tipo "-", "0", "NA". */
const MIN_CHIAVE = 3;

/** Normalizza una chiave di aggancio (stessa convenzione di voceInterventoLink). */
export function normChiaveImpianto(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length >= MIN_CHIAVE ? s : '';
}

/** Normalizza il committente per il confronto (mai vuoto → 'acea', come default DB). */
export function normCommittente(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '' ? 'acea' : s;
}

/** Estrae la nota compilata dall'operatore dalle risposte di una voce (campo `note`). */
export function notaDaRisposte(risposte: unknown): string | null {
  const n = (risposte as { note?: unknown } | null | undefined)?.note;
  if (typeof n !== 'string') return null;
  const t = n.trim();
  return t === '' ? null : t;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" (pura manipolazione di stringa, come utils/date-it). */
function labelData(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/**
 * Costruisce, dalle righe `{intervento_id, risposte}` delle voci che hanno chiuso gli
 * interventi precedenti, la mappa intervento → nota. Righe attese in ordine di
 * preferenza (es. updated_at desc): vince la prima nota non vuota per intervento.
 */
export function mappaNotePerIntervento(
  righe: Array<{ intervento_id: string | null; risposte: unknown }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of righe) {
    if (!r.intervento_id || out.has(r.intervento_id)) continue;
    const nota = notaDaRisposte(r.risposte);
    if (nota) out.set(r.intervento_id, nota);
  }
  return out;
}

/** Chiave d'indice: committente + valore identificante (matricola o PDR). */
function chiaveIndice(committente: unknown, valore: unknown): string {
  const v = normChiaveImpianto(valore);
  return v ? `${normCommittente(committente)}|${v}` : '';
}

/**
 * Abbina a ogni voce del rapportino le note dei PRECEDENTI interventi positivi sullo
 * stesso impianto (match per matricola O PDR, normalizzati) e SOLO dello stesso
 * committente. Esclusi gli interventi collegati alle voci del rapportino stesso (una
 * voce non "tramanda" a sé stessa né alle sorelle dello stesso giro). Ordinamento per
 * data desc (più recente prima), cap a MAX_NOTE_PRECEDENTI. Ritorna solo le voci con
 * almeno una nota.
 */
export function costruisciNotePrecedenti(args: {
  voci: VoceChiaviImpianto[];
  interventi: InterventoPrecedenteRow[];
  notePerIntervento: Map<string, string>;
  staffNomi?: Map<string, string>;
}): Map<string, NotaPrecedente[]> {
  const { voci, interventi, notePerIntervento } = args;
  const staffNomi = args.staffNomi ?? new Map<string, string>();

  const propriIds = new Set<string>();
  for (const v of voci) if (v.interventoId) propriIds.add(v.interventoId);

  // Indici committente-scoped: solo interventi positivi CON una nota, esclusi quelli del giro.
  const byMatricola = new Map<string, InterventoPrecedenteRow[]>();
  const byPdr = new Map<string, InterventoPrecedenteRow[]>();
  const put = (m: Map<string, InterventoPrecedenteRow[]>, chiave: string, row: InterventoPrecedenteRow) => {
    if (!chiave) return;
    const arr = m.get(chiave);
    if (arr) arr.push(row);
    else m.set(chiave, [row]);
  };
  for (const it of interventi) {
    if (propriIds.has(it.id)) continue;
    if (!notePerIntervento.has(it.id)) continue;
    put(byMatricola, chiaveIndice(it.committente, it.matricola_contatore), it);
    put(byPdr, chiaveIndice(it.committente, it.pdr), it);
  }

  const out = new Map<string, NotaPrecedente[]>();
  for (const voce of voci) {
    const visti = new Set<string>();
    const candidati: InterventoPrecedenteRow[] = [];
    for (const it of [
      ...(byMatricola.get(chiaveIndice(voce.committente, voce.matricola)) ?? []),
      ...(byPdr.get(chiaveIndice(voce.committente, voce.pdr)) ?? []),
    ]) {
      if (visti.has(it.id)) continue;
      visti.add(it.id);
      candidati.push(it);
    }
    if (candidati.length === 0) continue;

    candidati.sort((a, b) => {
      const da = a.data ?? '';
      const db = b.data ?? '';
      if (da !== db) return db.localeCompare(da); // data desc, senza data in fondo
      return a.id.localeCompare(b.id); // determinismo
    });

    const note: NotaPrecedente[] = [];
    for (const it of candidati.slice(0, MAX_NOTE_PRECEDENTI)) {
      note.push({
        interventoId: it.id,
        testo: notePerIntervento.get(it.id) ?? '',
        data: it.data,
        dataLabel: labelData(it.data),
        attivita: it.intervento_tipo,
        operatore: it.staff_id ? (staffNomi.get(it.staff_id) ?? null) : null,
      });
    }
    out.set(voce.id, note);
  }
  return out;
}
