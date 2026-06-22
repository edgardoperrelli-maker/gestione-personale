// Colori coerenti per le viste Performance (barre confronto + donut attività).
// Approccio palette: CSS var() strings — recharts accetta var() nelle prop fill/stroke
// dei componenti React (SVG attrs); nei contentStyle inline CSS var() funziona sempre.
// Se un chart specifico non risolve var() in SVG, usare getComputedStyle come fallback.
export const MACRO_COLORS: Record<string, string> = {
  Limitazioni:             'var(--chart-1)',
  'Morosità / forniture':  'var(--chart-3)',
  Sospensioni:             'var(--chart-4)',
  Bonifiche:               'var(--chart-2)',
  Picarro:                 'var(--chart-5)',
  'Flusso idrico':         'var(--chart-6)',
  'Sostituzioni / sonde':  'var(--chart-4)',
  Altro:                   'var(--chart-7)',
  'Non specificato':       'var(--chart-8)',
};
export function colorForMacro(name: string): string {
  return MACRO_COLORS[name] ?? 'var(--chart-7)';
}

/** Palette generica posizionale per donut committente/territorio. */
export const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

/**
 * Stile condiviso per recharts Tooltip + assi a tema.
 * contentStyle è CSS inline su un DOM div → var() funziona perfettamente.
 */
export const chartTooltipContent: React.CSSProperties = {
  background:   'var(--brand-surface)',
  border:       '1px solid var(--brand-border)',
  borderRadius: 8,
  color:        'var(--brand-text-main)',
  boxShadow:    'var(--shadow-md)',
  fontSize:     12,
};
export const chartItemStyle: React.CSSProperties  = { color: 'var(--brand-text-muted)' };
export const chartLabelStyle: React.CSSProperties = { color: 'var(--brand-text-muted)' };

/** Stroke per CartesianGrid, tick fill per XAxis/YAxis */
export const CHART_GRID_STROKE  = 'var(--brand-border)';
export const CHART_TICK_FILL    = 'var(--brand-text-muted)';

// Required for the CSSProperties type above without importing React in every file.
import type React from 'react';
