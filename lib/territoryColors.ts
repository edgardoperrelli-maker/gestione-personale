export type TerritoryStyle = {
  bg: string;
  border: string;
  text: string;
  band: string;
};

// Versione dark-card: bg = colore translucido scuro su navy, text/band = versione
// brillante e leggibile, border = colore con alpha ridotta. Territori distinguibili.
export const TERRITORY_COLORS: Record<string, TerritoryStyle> = {
  FIRENZE:        { bg: 'rgba(251,146,60,0.16)',  border: 'rgba(251,146,60,0.40)',  text: '#FDBA74', band: '#FB923C' },
  AURELIA:        { bg: 'rgba(74,222,128,0.16)',  border: 'rgba(74,222,128,0.40)',  text: '#86EFAC', band: '#4ADE80' },
  'LAZIO EST':    { bg: 'rgba(56,189,248,0.16)',  border: 'rgba(56,189,248,0.40)',  text: '#7DD3FC', band: '#38BDF8' },
  PADOVA:         { bg: 'rgba(167,139,250,0.16)', border: 'rgba(167,139,250,0.40)', text: '#C4B5FD', band: '#A78BFA' },
  PERUGIA:        { bg: 'rgba(251,113,133,0.16)', border: 'rgba(251,113,133,0.40)', text: '#FDA4AF', band: '#FB7185' },
  'LAZIO CENTRO': { bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.40)', text: '#CBD5E1', band: '#94A3B8' },
  NAPOLI:         { bg: 'rgba(34,211,238,0.16)',  border: 'rgba(34,211,238,0.40)',  text: '#67E8F9', band: '#22D3EE' },
};

export const TERRITORY_FALLBACK: TerritoryStyle = {
  bg: 'rgba(148,163,184,0.14)',
  border: 'rgba(148,163,184,0.38)',
  text: '#CBD5E1',
  band: '#94A3B8',
};

export function getTerritoryStyle(territoryName?: string | null): TerritoryStyle {
  const key = (territoryName ?? '').trim().toUpperCase();
  return TERRITORY_COLORS[key] ?? TERRITORY_FALLBACK;
}
