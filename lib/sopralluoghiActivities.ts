import type { Activity } from '@/types';

const EXCLUDED_ACTIVITY_NAMES = new Set([
  '104',
  'FERIE',
  'MAGAZZINO',
  'MALATTIA',
]);

export type SopralluoghiActivity = Pick<Activity, 'id' | 'name'>;

export function normalizeSopralluoghiActivityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function isSopralluoghiActivityAllowed(activity: Pick<Activity, 'name'>): boolean {
  return !EXCLUDED_ACTIVITY_NAMES.has(normalizeSopralluoghiActivityName(activity.name));
}

export function filterSopralluoghiActivities<T extends Pick<Activity, 'name'>>(activities: T[]): T[] {
  return activities.filter((activity) => isSopralluoghiActivityAllowed(activity));
}
