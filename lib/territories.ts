import type { Territory } from '@/types';

function normalizeIso(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

export function isTerritoryValidOnDay(
  territory: Pick<Territory, 'active' | 'valid_from' | 'valid_to'> | null | undefined,
  isoDay: string,
  todayIso?: string
): boolean {
  if (!territory) return true;
  if (todayIso && isoDay < todayIso) return true;
  if (territory.active === false) return false;

  const validFrom = normalizeIso(territory.valid_from);
  const validTo = normalizeIso(territory.valid_to);

  if (validFrom && isoDay < validFrom) return false;
  if (validTo && isoDay > validTo) return false;
  return true;
}

export function isTerritoryRelevantForRange(
  territory: Pick<Territory, 'active' | 'valid_from' | 'valid_to'> | null | undefined,
  rangeFromIso: string,
  rangeToIso: string,
  todayIso?: string
): boolean {
  if (!territory) return true;
  if (todayIso && rangeToIso < todayIso) return true;
  if (territory.active === false) return false;

  const effectiveFrom = todayIso && rangeFromIso < todayIso ? todayIso : rangeFromIso;
  const validFrom = normalizeIso(territory.valid_from);
  const validTo = normalizeIso(territory.valid_to);

  if (validFrom && validFrom > rangeToIso) return false;
  if (validTo && validTo < effectiveFrom) return false;
  return true;
}
