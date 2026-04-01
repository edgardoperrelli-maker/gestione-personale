export type TerritoryStyle = {
  bg: string;
  border: string;
  text: string;
  band: string;
};

export const TERRITORY_COLORS: Record<string, TerritoryStyle> = {
  FIRENZE: { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412', band: '#FB923C' },
  AURELIA: { bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D', band: '#22C55E' },
  'LAZIO EST': { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E3A8A', band: '#3B82F6' },
  PADOVA: { bg: '#F5F3FF', border: '#DDD6FE', text: '#4C1D95', band: '#8B5CF6' },
  PERUGIA: { bg: '#FFF1F2', border: '#FECDD3', text: '#881337', band: '#F43F5E' },
  'LAZIO CENTRO': { bg: '#F8FAFC', border: '#E2E8F0', text: '#1E293B', band: '#94A3B8' },
  NAPOLI: { bg: '#EFF6FF', border: '#BAE6FD', text: '#0C4A6E', band: '#0EA5E9' },
};

export const TERRITORY_FALLBACK: TerritoryStyle = {
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#334155',
  band: '#94A3B8',
};

export function getTerritoryStyle(territoryName?: string | null): TerritoryStyle {
  const key = (territoryName ?? '').trim().toUpperCase();
  return TERRITORY_COLORS[key] ?? TERRITORY_FALLBACK;
}
