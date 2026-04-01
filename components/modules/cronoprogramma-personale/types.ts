export type Role = 'viewer' | 'editor' | 'admin';

export type DayRow = { id: string; day: string; note?: string };

export type ViewMode = 'month' | 'twoWeeks' | 'week';

export type SortMode =
  | 'AZ'
  | 'REPERIBILE'
  | 'ATTIVITA'
  | 'TERRITORIO'
  | 'SENZA_ATTIVITA'
  | 'PER_TERRITORIO';

export type PlannerView = 'grid' | 'calendar' | 'table';

export type FilterToken = string;
