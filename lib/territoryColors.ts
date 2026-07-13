export type TerritoryStyle = {
  bg: string;
  border: string;
  text: string;
  band: string;
};

// Tema SCURO (card translucide su navy): testo/band brillanti e leggibili.
export const TERRITORY_COLORS: Record<string, TerritoryStyle> = {
  FIRENZE:        { bg: 'rgba(251,146,60,0.16)',  border: 'rgba(251,146,60,0.40)',  text: '#FDBA74', band: '#FB923C' },
  AURELIA:        { bg: 'rgba(74,222,128,0.16)',  border: 'rgba(74,222,128,0.40)',  text: '#86EFAC', band: '#4ADE80' },
  'LAZIO EST':    { bg: 'rgba(56,189,248,0.16)',  border: 'rgba(56,189,248,0.40)',  text: '#7DD3FC', band: '#38BDF8' },
  PADOVA:         { bg: 'rgba(167,139,250,0.16)', border: 'rgba(167,139,250,0.40)', text: '#C4B5FD', band: '#A78BFA' },
  PERUGIA:        { bg: 'rgba(251,113,133,0.16)', border: 'rgba(251,113,133,0.40)', text: '#FDA4AF', band: '#FB7185' },
  'LAZIO CENTRO': { bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.40)', text: '#CBD5E1', band: '#94A3B8' },
  NAPOLI:         { bg: 'rgba(232,121,249,0.16)', border: 'rgba(232,121,249,0.40)', text: '#F0ABFC', band: '#E879F9' },
};

export const TERRITORY_FALLBACK: TerritoryStyle = {
  bg: 'rgba(148,163,184,0.14)',
  border: 'rgba(148,163,184,0.38)',
  text: '#CBD5E1',
  band: '#94A3B8',
};

// Tema CHIARO (card su bianco): tinta soft, testo scuro leggibile, look sobrio.
const TERRITORY_COLORS_LIGHT: Record<string, TerritoryStyle> = {
  FIRENZE:        { bg: 'rgba(234,88,12,0.08)',   border: 'rgba(234,88,12,0.26)',   text: '#9A3412', band: '#EA580C' },
  AURELIA:        { bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.26)',   text: '#15803D', band: '#16A34A' },
  'LAZIO EST':    { bg: 'rgba(2,132,199,0.08)',   border: 'rgba(2,132,199,0.26)',   text: '#075985', band: '#0284C7' },
  PADOVA:         { bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.26)',  text: '#5B21B6', band: '#7C3AED' },
  PERUGIA:        { bg: 'rgba(225,29,72,0.08)',   border: 'rgba(225,29,72,0.24)',   text: '#9F1239', band: '#E11D48' },
  'LAZIO CENTRO': { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.26)', text: '#475569', band: '#64748B' },
  NAPOLI:         { bg: 'rgba(192,38,211,0.08)',  border: 'rgba(192,38,211,0.26)',  text: '#86198F', band: '#C026D3' },
};

const TERRITORY_FALLBACK_LIGHT: TerritoryStyle = {
  bg: 'rgba(100,116,139,0.07)',
  border: 'rgba(100,116,139,0.24)',
  text: '#475569',
  band: '#64748B',
};

function isLightTheme(): boolean {
  // Il chiaro è il default dell'app; in SSR (niente document) assumiamo chiaro.
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('light');
}

export function getTerritoryStyle(territoryName?: string | null): TerritoryStyle {
  const key = (territoryName ?? '').trim().toUpperCase();
  if (isLightTheme()) {
    return TERRITORY_COLORS_LIGHT[key] ?? TERRITORY_FALLBACK_LIGHT;
  }
  return TERRITORY_COLORS[key] ?? TERRITORY_FALLBACK;
}
