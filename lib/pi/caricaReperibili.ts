import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RigaReperibile } from './reperibili';

/**
 * Fallback per la mappatura foglia → territori del cronoprogramma (per NOME), usato
 * solo per le reperibilità senza `zona_reperibilita` esplicita. Lazio Centro/Est
 * accorpa "LAZIO CENTRO" e "LAZIO EST".
 */
const AREA_TERRITORI: Record<string, string[]> = {
  firenze: ['firenze'],
  lazio_centro_est: ['lazio centro', 'lazio est'],
  perugia: ['perugia'],
};

async function territoriDellArea(areaCodice: string): Promise<string[]> {
  const termini = AREA_TERRITORI[areaCodice];
  if (!termini || termini.length === 0) return [];
  const { data } = await supabaseAdmin.from('territories').select('id, name');
  return ((data ?? []) as Array<{ id: string; name: string }>)
    .filter((t) => termini.some((term) => (t.name ?? '').toLowerCase().includes(term)))
    .map((t) => t.id);
}

type AsgRow = {
  day_id: string;
  staff_id: string | null;
  territory_id: string | null;
  zona_reperibilita: string | null;
  staff: { display_name?: string } | { display_name?: string }[] | null;
};

/**
 * Carica i reperibili del cronoprogramma nella finestra [dal, al] (YYYY-MM-DD).
 * Se `areaCodice` è valorizzato, tiene solo i reperibili la cui ZONA reperibilità è
 * quella foglia (`zona_reperibilita = areaCodice`), con fallback per NOME territorio
 * per le reperibilità che non hanno ancora la zona impostata.
 * Resiliente se la colonna `zona_reperibilita` non è ancora in DB.
 */
export async function caricaReperibili(dal: string, al: string, areaCodice?: string): Promise<RigaReperibile[]> {
  const { data: days } = await supabaseAdmin.from('calendar_days').select('id, day').gte('day', dal).lte('day', al);
  const dayMap = new Map<string, string>();
  const dayIds: string[] = [];
  for (const d of (days ?? []) as Array<{ id: string; day: string }>) {
    dayMap.set(d.id, d.day);
    dayIds.push(d.id);
  }
  if (dayIds.length === 0) return [];

  const territoryIds = areaCodice ? await territoriDellArea(areaCodice) : [];

  // Select con zona_reperibilita; fallback senza la colonna (DB non ancora migrato).
  const full = await supabaseAdmin
    .from('assignments')
    .select('day_id, staff_id, reperibile, territory_id, zona_reperibilita, staff:staff_id ( display_name )')
    .in('day_id', dayIds)
    .eq('reperibile', true);
  let rows: AsgRow[];
  if (!full.error) {
    rows = (full.data ?? []) as AsgRow[];
  } else {
    const base = await supabaseAdmin
      .from('assignments')
      .select('day_id, staff_id, reperibile, territory_id, staff:staff_id ( display_name )')
      .in('day_id', dayIds)
      .eq('reperibile', true);
    rows = ((base.data ?? []) as Array<Omit<AsgRow, 'zona_reperibilita'>>).map((r) => ({ ...r, zona_reperibilita: null }));
  }

  const out: RigaReperibile[] = [];
  for (const a of rows) {
    const data = dayMap.get(a.day_id);
    if (!data || !a.staff_id) continue;
    if (areaCodice) {
      const zonaOk = a.zona_reperibilita === areaCodice;
      const fallbackOk = !a.zona_reperibilita && !!a.territory_id && territoryIds.includes(a.territory_id);
      if (!zonaOk && !fallbackOk) continue;
    }
    const staff = Array.isArray(a.staff) ? a.staff[0] : a.staff;
    out.push({ data, staff_id: a.staff_id, staff_name: staff?.display_name ?? null });
  }
  return out;
}
