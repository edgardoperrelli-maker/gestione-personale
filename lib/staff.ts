import type { Staff } from '@/types';

function normalizeIso(value?: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

export function isStaffValidOnDay(
  staff: Pick<Staff, 'valid_from' | 'valid_to'> | null | undefined,
  isoDay: string,
  todayIso?: string
): boolean {
  if (!staff) return true;
  if (todayIso && isoDay < todayIso) return true;

  const validFrom = normalizeIso(staff.valid_from);
  const validTo = normalizeIso(staff.valid_to);

  if (validFrom && isoDay < validFrom) return false;
  if (validTo && isoDay > validTo) return false;
  return true;
}

export function isStaffRelevantForRange(
  staff: Pick<Staff, 'valid_from' | 'valid_to'> | null | undefined,
  rangeFromIso: string,
  rangeToIso: string,
  todayIso?: string
): boolean {
  if (!staff) return true;
  if (todayIso && rangeToIso < todayIso) return true;

  const effectiveFrom = todayIso && rangeFromIso < todayIso ? todayIso : rangeFromIso;
  const validFrom = normalizeIso(staff.valid_from);
  const validTo = normalizeIso(staff.valid_to);

  if (validFrom && validFrom > rangeToIso) return false;
  if (validTo && validTo < effectiveFrom) return false;
  return true;
}

export function formatStaffStartAddress(
  staff: Pick<Staff, 'start_address' | 'start_cap' | 'start_city'>
): string {
  return [staff.start_address, [staff.start_cap, staff.start_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function formatStaffHomeAddress(
  staff: Pick<Staff, 'home_address' | 'home_cap' | 'home_city'>
): string {
  return [
    staff.home_address,
    [staff.home_cap, staff.home_city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
}
