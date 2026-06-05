// utils/rapportini/rangePeriodo.ts
export type PeriodoPreset = { k: string; label: string; giorni: number };

export const PERIODI: PeriodoPreset[] = [
  { k: '7', label: 'Ultimi 7 giorni', giorni: 7 },
  { k: '30', label: 'Ultimi 30 giorni', giorni: 30 },
  { k: '90', label: 'Ultimi 90 giorni', giorni: 90 },
];

export const GIORNI_FUTURO = 14; // i preset includono i rapportini pianificati nei prossimi giorni

export type RangeCustom = { dataDa: string; dataA: string };

/**
 * Finestra { from, to } (YYYY-MM-DD) per il fetch del riepilogo.
 * - preset: from = oggi - giorni, to = oggi + GIORNI_FUTURO.
 * - 'custom': usa dataDa/dataA esatti; null se incompleti o dataDa > dataA.
 * Calcolo in UTC: oggiIso interpretato come mezzanotte UTC per evitare slittamenti di fuso.
 */
export function calcolaRange(
  periodo: string,
  custom: RangeCustom,
  oggiIso: string,
): { from: string; to: string } | null {
  if (periodo === 'custom') {
    const { dataDa, dataA } = custom;
    if (!dataDa || !dataA || dataDa > dataA) return null;
    return { from: dataDa, to: dataA };
  }
  const giorni = PERIODI.find((p) => p.k === periodo)?.giorni ?? 30;
  const base = new Date(`${oggiIso}T00:00:00Z`).getTime();
  const day = 24 * 3600 * 1000;
  const from = new Date(base - giorni * day).toISOString().slice(0, 10);
  const to = new Date(base + GIORNI_FUTURO * day).toISOString().slice(0, 10);
  return { from, to };
}
