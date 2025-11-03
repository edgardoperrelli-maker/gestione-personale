export type Staff = { id:string; display_name:string; active?:boolean };
export type Activity = { id:string; name:string; active?:boolean };
export type Territory = { id:string; name:string; active?:boolean };

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



