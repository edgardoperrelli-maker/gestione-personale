import { z } from 'zod';

const strArr = z.array(z.string()).optional().default([]);

export const RegolaSchema = z.object({
  staffId: z.string().min(1),
  staffName: z.string().optional(),
  filtroOds: strArr,
  filtroIndirizzo: strArr,
  filtroCap: strArr,
  filtroAttivita: strArr,
  maxInterventi: z.number().int().positive().nullable().optional().default(null),
  ordine: z.number().int().optional().default(0),
});
export type Regola = z.infer<typeof RegolaSchema>;

function hasAnyFilter(r: Regola): boolean {
  return r.filtroOds.length + r.filtroIndirizzo.length + r.filtroCap.length + r.filtroAttivita.length > 0;
}

export function parseRegole(input: unknown): Regola[] {
  if (!Array.isArray(input)) return [];
  const out: Regola[] = [];
  for (const item of input) {
    const parsed = RegolaSchema.safeParse(item);
    if (parsed.success && hasAnyFilter(parsed.data)) out.push(parsed.data);
  }
  return out;
}

export function buildRuleRows(pianoId: string, regole: Regola[]) {
  return regole.map((r) => ({
    piano_id: pianoId,
    staff_id: r.staffId,
    staff_name: r.staffName ?? null,
    filtro_ods: r.filtroOds,
    filtro_indirizzo: r.filtroIndirizzo,
    filtro_cap: r.filtroCap,
    filtro_attivita: r.filtroAttivita,
    max_interventi: r.maxInterventi,
    ordine: r.ordine,
  }));
}

export function buildLockRows(pianoId: string, lucchetti: unknown) {
  if (!lucchetti || typeof lucchetti !== 'object') return [];
  return Object.entries(lucchetti as Record<string, unknown>)
    .filter(([staffId]) => staffId.length > 0)
    .map(([staffId, aperto]) => ({ piano_id: pianoId, staff_id: staffId, aperto: aperto !== false }));
}
