// Helper di data puri per il DatePicker a tema.
// Convenzione: mese 1-12. ISO = 'YYYY-MM-DD'. Griglia lunedì-first.

export type GridCell = { y: number; m: number; d: number; iso: string; inMonth: boolean };

export const MONTH_NAMES_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export const WEEKDAY_LABELS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (typeof iso !== 'string') return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function formatDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_IT[month - 1]} ${year}`;
}

export function buildMonthGrid(year: number, month: number): GridCell[] {
  // Lunedì-first: quante celle del mese precedente mostrare prima del giorno 1.
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Dom..6=Sab
  const offset = (firstDow + 6) % 7; // 0 se lunedì
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(year, month - 1, 1 - offset + i);
    const cy = dt.getFullYear();
    const cm = dt.getMonth() + 1;
    const cd = dt.getDate();
    cells.push({ y: cy, m: cm, d: cd, iso: toIso(cy, cm, cd), inMonth: cm === month && cy === year });
  }
  return cells;
}
