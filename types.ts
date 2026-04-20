export type Staff = {
  id:string;
  display_name:string;
  active?:boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  start_address?: string | null;
  start_cap?: string | null;
  start_city?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  home_address?: string | null;
  home_cap?: string | null;
  home_city?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
};
export type Activity = { id:string; name:string; active?:boolean };
export type Territory = {
  id:string;
  name:string;
  active?:boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string | null;
};

import type { CostCenter } from '@/constants/cost-centers';
export type { CostCenter } from '@/constants/cost-centers';

export type Assignment = {
  id: string;
  day_id: string;
  staff?: { id:string; display_name:string } | null;
  activity?: { id:string; name:string } | null;
  territory?: { id:string; name:string } | null;
  cost_center?: CostCenter | null;
  reperibile: boolean;
  notes?: string | null;
};



