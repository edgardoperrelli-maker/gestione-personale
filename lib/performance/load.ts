import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GRUPPO_NON_CENSITO, labelCommittente, type ClientRow, type SelectOption } from '@/lib/performance/shape';
import { valoreSaracinesca } from '@/lib/limitazione/exportLimMassive';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, committenteEquivalente, risolviGruppo } from '@/lib/attivita/tassonomia';

const STATO_CONTEGGIABILE = 'completato';
const PAGE = 1000;

interface RawRow {
  id: string;
  staff_id: string | null;
  data: string;
  territorio_id: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  esito: string | null;
}

async function fetchInterventi(): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, staff_id, data, territorio_id, committente, intervento_tipo, esito')
      .eq('stato', STATO_CONTEGGIABILE)
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error('[performance] fetchInterventi', error); break; }
    const batch = (data ?? []) as RawRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/**
 * Voci con saracinesca SI, tollerante al TIPO salvato (booleano o stringa, due chiavi
 * possibili: `sostituzione_valvola`/`sost_valvola`). Filtro fatto in-memory con la stessa
 * `valoreSaracinesca` usata dall'export agente: un filtro server-side su `->>chiave = 'SI'`
 * perdeva le voci salvate come booleano `true` (stesso bug corretto in PR #70).
 */
async function fetchValvolaSet(): Promise<Set<string>> {
  const set = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id, risposte')
      .not('intervento_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error('[performance] fetchValvolaSet', error); break; }
    const batch = (data ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>;
    for (const r of batch) {
      if (!r.intervento_id) continue;
      const sar = valoreSaracinesca(r.risposte?.['sostituzione_valvola'], r.risposte?.['sost_valvola']);
      if (sar === 'SI') set.add(r.intervento_id);
    }
    if (batch.length < PAGE) break;
  }
  return set;
}

async function loadMaps() {
  const [{ data: staff }, { data: terr }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, display_name'),
    supabaseAdmin.from('territories').select('id, name'),
  ]);
  const staffName = new Map<string, string>();
  for (const s of (staff ?? []) as Array<{ id: string; display_name: string | null }>) {
    staffName.set(s.id, (s.display_name ?? '').trim() || 'Operatore');
  }
  const territoryName = new Map<string, string>();
  for (const t of (terr ?? []) as Array<{ id: string; name: string | null }>) {
    territoryName.set(t.id, (t.name ?? '').trim() || 'Territorio');
  }
  return { staffName, territoryName };
}

export interface PerformanceBundle {
  rows: ClientRow[];
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  gruppi: SelectOption[];
  attivita: SelectOption[];
  minDate: string | null;
}

/** Carica tutti gli interventi completati (nomi + tassonomia reale + flag saracinesca) e le opzioni filtro. */
export async function loadPerformanceBundle(): Promise<PerformanceBundle> {
  const [raw, maps, valvolaSet, tassonomia] = await Promise.all([
    fetchInterventi(), loadMaps(), fetchValvolaSet(), caricaTassonomia(),
  ]);
  const tassIndex = buildTassonomiaIndex(tassonomia);

  const rows: ClientRow[] = raw.map((r) => {
    // Tassonomia reale (committente, descrizione) → gruppo + forma canonica della descrizione.
    // `allinea: true` accorpa i duplicati/typo (SOLO qui in lettura; i write-path restano grezzi).
    // Fallback 'altro' (prova acea poi italgas) come in taskToIntervento: un codice ATLAS
    // italgas loggato sotto 'acea' risolve comunque alla sua attività/gruppo reali.
    const riga = risolviGruppo(r.committente, r.intervento_tipo, tassIndex, { allinea: true })
      ?? risolviGruppo('altro', r.intervento_tipo, tassIndex, { allinea: true });
    return {
      id: r.id,
      staffId: r.staff_id ?? '',
      operatore: (r.staff_id && maps.staffName.get(r.staff_id)) || 'Sconosciuto',
      data: r.data.slice(0, 10),
      territorioId: r.territorio_id ?? '',
      territorio: (r.territorio_id && maps.territoryName.get(r.territorio_id)) || 'Senza territorio',
      // Committente canonico = quello dell'attività risolta (lim_massive→acea, codice italgas
      // sotto acea→italgas). Se non risolta, l'equivalente del valore grezzo (Q1).
      committente: committenteEquivalente(riga?.committente ?? r.committente) || (r.committente ?? '').trim(),
      gruppo: riga?.gruppo ?? GRUPPO_NON_CENSITO,
      attivita: riga?.descrizione ?? (r.intervento_tipo ?? '').trim(),
      valvola: valvolaSet.has(r.id),
      esito: r.esito ?? '',
    };
  });

  // Opzioni derivate dai dati (solo ciò che è effettivamente filtrabile).
  const opMap = new Map<string, string>();
  const terrMap = new Map<string, string>();
  const commSet = new Set<string>();
  const gruppoSet = new Set<string>();
  const attSet = new Set<string>();
  let minDate: string | null = null;
  for (const r of rows) {
    if (r.staffId) opMap.set(r.staffId, r.operatore);
    if (r.territorioId) terrMap.set(r.territorioId, r.territorio);
    if (r.committente) commSet.add(r.committente);
    gruppoSet.add(r.gruppo);
    if (r.attivita) attSet.add(r.attivita);
    if (!minDate || r.data < minDate) minDate = r.data;
  }
  const byLabel = (a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, 'it', { sensitivity: 'base' });
  const operatori = Array.from(opMap, ([value, label]) => ({ value, label })).sort(byLabel);
  const territori = Array.from(terrMap, ([value, label]) => ({ value, label })).sort(byLabel);
  const committenti = Array.from(commSet, (v) => ({ value: v, label: labelCommittente(v) })).sort(byLabel);
  // "Non censita" in coda: è il residuo, non un gruppo reale.
  const gruppi = Array.from(gruppoSet, (v) => ({ value: v, label: v }))
    .sort((a, b) => Number(a.value === GRUPPO_NON_CENSITO) - Number(b.value === GRUPPO_NON_CENSITO) || byLabel(a, b));
  const attivita = Array.from(attSet, (v) => ({ value: v, label: v })).sort(byLabel);

  return { rows, operatori, territori, committenti, gruppi, attivita, minDate };
}
