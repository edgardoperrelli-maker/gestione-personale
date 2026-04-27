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
  /** NULL = Lazio. Se impostato, niente hotel per quel territorio. */
  home_territory_id?: string | null;
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

export type HotelRoomPrice = {
  id: string;
  hotel_id: string;
  room_type: string;
  price_per_night: number;
  dinner_price_per_person?: number | null;
  notes?: string | null;
};

export type Hotel = {
  id: string;
  name: string;
  email?: string | null;
  territory_id?: string | null;
  territory?: Territory | null;
  active: boolean;
  stars?: number;
  room_prices?: HotelRoomPrice[];
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



