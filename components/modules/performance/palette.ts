// Colori coerenti per le viste Performance (barre confronto + donut attività).
// Approccio palette: CSS var() strings — usare getComputedStyle per i prop SVG
// di recharts (fill/stroke), dove il browser NON risolve var() in attributi SVG.
// Nei contentStyle/itemStyle inline CSS var() funziona sempre (DOM style object).

// Required for the CSSProperties type and hooks below.
import type React from 'react';
import { useState, useEffect } from 'react';

import { GRUPPO_NON_CENSITO } from '@/lib/performance/shape';

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

/** Stroke per CartesianGrid, tick fill per XAxis/YAxis — SOLO come fallback
 *  per component logic non-SVG (es. Legend wrapperStyle). Per i prop SVG di
 *  recharts usare useChartColors() che restituisce valori concreti. */
export const CHART_GRID_STROKE  = 'var(--brand-border)';
export const CHART_TICK_FILL    = 'var(--brand-text-muted)';

// ─── Resolved colors for recharts SVG props ──────────────────────────────────

/** Token CSS → indice nel PALETTE array (chart-1..8, base-1). */
const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
] as const;

/**
 * Colore stabile per gruppo attività: posizione del gruppo nella lista GLOBALE
 * dei gruppi (opzioni filtro, uguale per tutti i grafici) → stesso colore ovunque
 * a prescindere dai filtri. "Non censita" è sempre grigio (--chart-8).
 */
export function makeColorForGruppo(gruppiGlobali: Array<{ value: string }>, palette: string[]): (gruppo: string) => string {
  const idx = new Map(gruppiGlobali.filter((g) => g.value !== GRUPPO_NON_CENSITO).map((g, i) => [g.value, i]));
  return (gruppo: string) => {
    if (gruppo === GRUPPO_NON_CENSITO) return palette[7];
    const i = idx.get(gruppo);
    // I gruppi "veri" ruotano su chart-1..7, lasciando chart-8 al residuo.
    return i === undefined ? palette[6] : palette[i % 7];
  };
}

interface ResolvedChartColors {
  /** chart-1..8 come array di stringhe concrete. */
  palette: string[];
  /** Colore risolto per il token --brand-surface (stroke slice donut). */
  brandSurface: string;
  /** Colore risolto per il token --brand-border (CartesianGrid stroke). */
  brandBorder: string;
  /** Colore risolto per il token --brand-text-muted (axis tick fill). */
  brandTextMuted: string;
  /** Colore risolto per --warning (area scarto / saturazione). */
  warning: string;
  /** Colore risolto per --success (linea produzione / dedicati). */
  success: string;
  /** Colore risolto per --danger (esiti negativi). */
  danger: string;
  /** Colore risolto per --brand-primary (serie primaria). */
  brandPrimary: string;
}

function readTokens(): ResolvedChartColors {
  const cs = getComputedStyle(document.documentElement);
  const resolve = (token: string) => cs.getPropertyValue(token).trim() || '#888888';
  const palette = CHART_TOKENS.map((t) => resolve(t));
  return {
    palette,
    brandSurface:    resolve('--brand-surface'),
    brandBorder:     resolve('--brand-border'),
    brandTextMuted:  resolve('--brand-text-muted'),
    warning:      resolve('--warning'),
    success:      resolve('--success'),
    danger:       resolve('--danger'),
    brandPrimary: resolve('--brand-primary'),
  };
}

const FALLBACK: ResolvedChartColors = {
  palette:       Array(8).fill('#888888'),
  brandSurface:  '#1e293b',
  brandBorder:   '#334155',
  brandTextMuted:'#94a3b8',
  warning:      '#d97706',
  success:      '#16a34a',
  danger:       '#dc2626',
  brandPrimary: '#2563eb',
};

/**
 * Hook che risolve i token CSS in valori concreti per i prop SVG di recharts.
 * Si aggiorna automaticamente al cambio tema (MutationObserver su .light).
 */
export function useChartColors(): ResolvedChartColors {
  const [colors, setColors] = useState<ResolvedChartColors>(FALLBACK);

  useEffect(() => {
    // Lettura iniziale
    setColors(readTokens());

    // Re-lettura al cambio tema (aggiunta/rimozione classe .light su <html>)
    const observer = new MutationObserver(() => {
      setColors(readTokens());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
