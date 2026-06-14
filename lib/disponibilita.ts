export const TIPI_ASSENZA = ['ferie', '104', 'malattia', 'permesso', 'congedo', 'lutto'] as const;
export type TipoAssenza = typeof TIPI_ASSENZA[number];

export type Disponibilita = {
  id: string;
  staff_id: string;
  data: string;            // YYYY-MM-DD
  tipo: TipoAssenza;
  modalita: 'intera' | 'parziale';
  ora_da: string | null;   // 'HH:MM' (o 'HH:MM:SS' dal DB)
  ora_a: string | null;
  note: string | null;
};

/** Metadati UI per tipo: etichetta + colori (token tema, niente hard-coded). */
export const TIPO_META: Record<TipoAssenza, { label: string; bg: string; border: string; text: string }> = {
  ferie:    { label: 'Ferie',    bg: 'var(--info-soft)',           border: 'var(--info)',           text: 'var(--info)' },
  '104':    { label: '104',      bg: 'var(--viola-soft)',          border: 'var(--viola)',          text: 'var(--viola)' },
  malattia: { label: 'Malattia', bg: 'var(--danger-soft)',         border: 'var(--danger)',         text: 'var(--danger)' },
  permesso: { label: 'Permesso', bg: 'var(--warning-soft)',        border: 'var(--warning)',        text: 'var(--warning)' },
  congedo:  { label: 'Congedo',  bg: 'var(--success-soft)',        border: 'var(--success)',        text: 'var(--success)' },
  lutto:    { label: 'Lutto',    bg: 'var(--brand-surface-muted)', border: 'var(--brand-border)',   text: 'var(--brand-text-muted)' },
};

export function isTipoAssenza(v: unknown): v is TipoAssenza {
  return typeof v === 'string' && (TIPI_ASSENZA as readonly string[]).includes(v);
}

/** True se il nome attività corrisponde a un tipo di assenza (Ferie/104/Malattia/Permesso/Congedo/Lutto). */
export function isNomeAttivitaAssenza(name: string | null | undefined): boolean {
  return isTipoAssenza((name ?? '').toLowerCase().trim());
}

/** 'intera' se nessun orario, altrimenti 'parziale'. */
export function derivaModalita(ora_da: string | null, ora_a: string | null): 'intera' | 'parziale' {
  return !ora_da && !ora_a ? 'intera' : 'parziale';
}

export function isAssenzaIntera(d: Pick<Disponibilita, 'ora_da' | 'ora_a'>): boolean {
  return derivaModalita(d.ora_da, d.ora_a) === 'intera';
}

/** Normalizza 'HH:MM:SS' → 'HH:MM'. */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : t;
}

export function labelOrario(ora_da: string | null, ora_a: string | null): string {
  const da = hhmm(ora_da);
  const a = hhmm(ora_a);
  if (!da && !a) return 'tutto il giorno';
  if (da && a) return `${da}–${a}`;
  if (a) return `fino alle ${a}`;
  return `dalle ${da}`;
}

export function labelDisponibilita(d: Pick<Disponibilita, 'tipo' | 'ora_da' | 'ora_a'>): string {
  return `${TIPO_META[d.tipo].label} · ${labelOrario(d.ora_da, d.ora_a)}`;
}

/** Indicizza per `${staff_id}|${data}` (1 riga per operatore/giorno). */
export function indexByStaffData(rows: Disponibilita[]): Record<string, Disponibilita> {
  const m: Record<string, Disponibilita> = {};
  for (const r of rows) m[`${r.staff_id}|${r.data}`] = r;
  return m;
}
