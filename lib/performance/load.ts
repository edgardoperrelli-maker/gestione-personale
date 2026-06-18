import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { ClientRow, SelectOption } from '@/lib/performance/shape';

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
      .range(from, from + PAGE - 1);
    if (error) { console.error('[performance] fetchInterventi', error); break; }
    const batch = (data ?? []) as RawRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function fetchValvolaSet(): Promise<Set<string>> {
  const set = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id')
      .eq('risposte->>sostituzione_valvola', 'SI')
      .not('intervento_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[performance] fetchValvolaSet', error); break; }
    const batch = (data ?? []) as Array<{ intervento_id: string | null }>;
    for (const r of batch) if (r.intervento_id) set.add(r.intervento_id);
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
  minDate: string | null;
}

/** Carica tutti gli interventi completati (nomi risolti + flag saracinesca) e le opzioni filtro. */
export async function loadPerformanceBundle(): Promise<PerformanceBundle> {
  const [raw, maps, valvolaSet] = await Promise.all([fetchInterventi(), loadMaps(), fetchValvolaSet()]);

  const rows: ClientRow[] = raw.map((r) => ({
    id: r.id,
    staffId: r.staff_id ?? '',
    operatore: (r.staff_id && maps.staffName.get(r.staff_id)) || 'Sconosciuto',
    data: r.data.slice(0, 10),
    territorioId: r.territorio_id ?? '',
    territorio: (r.territorio_id && maps.territoryName.get(r.territorio_id)) || 'Senza territorio',
    committente: (r.committente ?? '').trim(),
    intervento_tipo: r.intervento_tipo ?? '',
    valvola: valvolaSet.has(r.id),
    esito: r.esito ?? '',
  }));

  // Opzioni derivate dai dati (solo ciò che è effettivamente filtrabile).
  const opMap = new Map<string, string>();
  const terrMap = new Map<string, string>();
  const commSet = new Set<string>();
  let minDate: string | null = null;
  for (const r of rows) {
    if (r.staffId) opMap.set(r.staffId, r.operatore);
    if (r.territorioId) terrMap.set(r.territorioId, r.territorio);
    if (r.committente) commSet.add(r.committente);
    if (!minDate || r.data < minDate) minDate = r.data;
  }
  const operatori = Array.from(opMap, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const territori = Array.from(terrMap, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const committenti = Array.from(commSet).sort().map((v) => ({ value: v, label: v }));

  return { rows, operatori, territori, committenti, minDate };
}
