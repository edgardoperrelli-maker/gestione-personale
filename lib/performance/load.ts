import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  aggregatePerformance,
  type PerfFilters,
  type PerformanceData,
  type RawIntervento,
  type SelectOption,
} from '@/lib/performance/shape';

const STATO_CONTEGGIABILE = 'completato';
const PAGE = 1000;

/** Carica gli interventi completati filtrati (paginazione) col client admin (service role). */
async function fetchInterventi(f: PerfFilters): Promise<RawIntervento[]> {
  const rows: RawIntervento[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin
      .from('interventi')
      .select('id, staff_id, data, territorio_id, committente, intervento_tipo, esito')
      .eq('stato', STATO_CONTEGGIABILE)
      .gte('data', f.dateFrom)
      .lte('data', f.dateTo);
    if (f.staffId) q = q.eq('staff_id', f.staffId);
    if (f.territorioId) q = q.eq('territorio_id', f.territorioId);
    if (f.committente) q = q.eq('committente', f.committente);
    const { data, error } = await q.order('data', { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error('[performance] fetchInterventi', error); break; }
    const batch = (data ?? []) as RawIntervento[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function loadMaps(): Promise<{ staffName: Map<string, string>; territoryName: Map<string, string> }> {
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

export async function loadPerformanceData(f: PerfFilters, selOperator: string | null): Promise<PerformanceData> {
  const [rows, maps] = await Promise.all([fetchInterventi(f), loadMaps()]);
  return aggregatePerformance(rows, maps.staffName, maps.territoryName, {
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    macroAttivita: f.macroAttivita,
    selOperator,
  });
}

/** Opzioni per i filtri: operatori (con interventi completati), territori, committenti. */
export async function loadPerformanceFilterOptions(): Promise<{
  operatori: SelectOption[];
  territori: SelectOption[];
  committenti: SelectOption[];
  minDate: string | null;
}> {
  const [{ data: staff }, { data: terr }, { data: comm }, { data: minRow }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, display_name, active').order('display_name', { ascending: true }),
    supabaseAdmin.from('territories').select('id, name').order('name', { ascending: true }),
    supabaseAdmin.from('interventi').select('committente').eq('stato', STATO_CONTEGGIABILE).not('committente', 'is', null),
    supabaseAdmin.from('interventi').select('data').eq('stato', STATO_CONTEGGIABILE).order('data', { ascending: true }).limit(1).maybeSingle(),
  ]);

  const operatori: SelectOption[] = ((staff ?? []) as Array<{ id: string; display_name: string | null; active: boolean | null }>)
    .map((s) => ({ value: s.id, label: (s.display_name ?? '').trim() || 'Operatore' }));

  const territori: SelectOption[] = ((terr ?? []) as Array<{ id: string; name: string | null }>)
    .map((t) => ({ value: t.id, label: (t.name ?? '').trim() || 'Territorio' }));

  const committentiSet = new Set<string>();
  for (const c of (comm ?? []) as Array<{ committente: string | null }>) {
    const v = (c.committente ?? '').trim();
    if (v) committentiSet.add(v);
  }
  const committenti: SelectOption[] = Array.from(committentiSet).sort().map((v) => ({ value: v, label: v }));

  const minDate = (minRow as { data?: string } | null)?.data?.slice(0, 10) ?? null;

  return { operatori, territori, committenti, minDate };
}
