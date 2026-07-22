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
  /** Squadra esecutrice (consuntivazione): [{staff_id, staff_name}]; [] per gli ordini normali. */
  esecutori?: Array<{ staff_id?: string | null; staff_name?: string | null }> | null;
}

async function fetchInterventi(): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  // `esecutori` è additiva (modulo Consuntivazione): se la colonna non esiste ancora (migration
  // non applicata) si ripiega sulla select senza — comportamento invariato.
  let cols = 'id, staff_id, data, territorio_id, committente, intervento_tipo, esito, esecutori';
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select(cols)
      .eq('stato', STATO_CONTEGGIABILE)
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/esecutori/i.test(error.message) && cols.includes('esecutori')) {
        cols = 'id, staff_id, data, territorio_id, committente, intervento_tipo, esito';
        from -= PAGE; // riprova la stessa pagina senza la colonna
        continue;
      }
      console.error('[performance] fetchInterventi', error);
      break;
    }
    const batch = ((data ?? []) as unknown) as RawRow[];
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

  const rows: ClientRow[] = raw.flatMap((r) => {
    // Tassonomia reale (committente, descrizione) → gruppo + forma canonica della descrizione.
    // `allinea: 'lettura'` accorpa i duplicati/typo (tier completo, incl. codici ATLAS solo-modulo).
    // Fallback 'altro' (prova acea poi italgas) come in taskToIntervento: un codice ATLAS
    // italgas loggato sotto 'acea' risolve comunque alla sua attività/gruppo reali.
    const riga = risolviGruppo(r.committente, r.intervento_tipo, tassIndex, { allinea: 'lettura' })
      ?? risolviGruppo('altro', r.intervento_tipo, tassIndex, { allinea: 'lettura' });
    const comune = { // parte condivisa da tutti gli esecutori dello stesso intervento
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
    const rigaPer = (staffId: string, idSuffix: string): ClientRow => ({
      id: idSuffix ? `${r.id}:${idSuffix}` : r.id,
      staffId,
      operatore: (staffId && maps.staffName.get(staffId)) || 'Sconosciuto',
      ...comune,
    });
    // Riga base: operatore primario (interventi.staff_id) — porta il valore economico UNA volta.
    const base = rigaPer(r.staff_id ?? '', '');
    // Consuntivazione con squadra: accredita la PARTECIPAZIONE anche agli esecutori oltre il
    // primario (interventi.esecutori). Gli ordini normali (esecutori vuoto) restano invariati.
    const squadra = Array.isArray(r.esecutori) ? r.esecutori : [];
    const extra = squadra
      .map((e) => String(e?.staff_id ?? '').trim())
      .filter((id) => id && id !== (r.staff_id ?? ''))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .map((id) => rigaPer(id, id));
    return [base, ...extra];
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
