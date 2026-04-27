import type { Territory } from '@/types';

const LAZIO_TERRITORY_NAMES = new Set([
  'ACEA',
  'AURELIA',
  'LAZIO CENTRO',
  'LAZIO EST',
]);

function normalizeTerritoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it-IT');
}

function territoryById(territories: Pick<Territory, 'id' | 'name'>[], territoryId: string | null | undefined) {
  if (!territoryId) return null;
  return territories.find((territory) => territory.id === territoryId) ?? null;
}

export function hotelAreaForTerritory(territory: Pick<Territory, 'id' | 'name'> | null | undefined) {
  if (!territory) return 'LAZIO';

  const normalized = normalizeTerritoryName(territory.name);
  if (normalized.includes('LAZIO') || LAZIO_TERRITORY_NAMES.has(normalized)) {
    return 'LAZIO';
  }

  return `TERRITORY:${territory.id}`;
}

export function operatorNeedsHotelForTerritory(
  homeTerritoryId: string | null | undefined,
  targetTerritoryId: string | null | undefined,
  territories: Pick<Territory, 'id' | 'name'>[],
) {
  if (!targetTerritoryId) return false;

  const targetTerritory = territoryById(territories, targetTerritoryId);
  const homeTerritory = territoryById(territories, homeTerritoryId);
  const homeArea = homeTerritoryId ? hotelAreaForTerritory(homeTerritory) : 'LAZIO';
  const targetArea = hotelAreaForTerritory(targetTerritory);

  return homeArea !== targetArea;
}
