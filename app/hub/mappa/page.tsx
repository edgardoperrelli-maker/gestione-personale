import 'leaflet/dist/leaflet.css';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import MappaOperatoriClient, {
  type MappaOperatorOption,
  type MappaStaffRow,
  type ZtlZoneInfo,
} from '@/components/modules/mappa/MappaOperatoriClient';
import { formatStaffStartAddress, formatStaffHomeAddress, isStaffRelevantForRange, isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';
import type { Task } from '@/utils/routing/types';

function fmtDay(d: Date) {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MappaPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const today = new Date();
  const todayIso = fmtDay(today);
  const dateFrom = fmtDay(addDays(today, -3));
  const dateTo = fmtDay(addDays(today, 4));

  const { data: territories } = await supabase
    .from('territories')
    .select('id, name, lat, lng')
    .order('name', { ascending: true });

  const { data: calendarDays } = await supabase
    .from('calendar_days')
    .select('id, day')
    .gte('day', dateFrom)
    .lte('day', dateTo)
    .order('day');

  const dayIdMap = new Map<string, string>();
  (calendarDays ?? []).forEach((d) => dayIdMap.set(d.id, d.day));

  const dayIds = (calendarDays ?? []).map((d) => d.id);

  const { data: staffRaw } = await supabase
    .from('staff')
    .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng')
    .order('display_name', { ascending: true });

  const staffList = (staffRaw ?? []) as Staff[];
  const staffById = new Map<string, Staff>();
  staffList.forEach((member) => {
    staffById.set(member.id, member);
  });

  // ── Fetch appuntamenti ──────────────────────────────────────────────────────────
  const { data: appointmentsRaw } = await supabase
    .from('appointments')
    .select('id, pdr, nome_cognome, indirizzo, cap, citta, lat, lng, data, fascia_oraria, tipo_intervento, territorio_id, status, territories(id, name)')
    .gte('data', todayIso)
    .lte('data', dateTo)
    .order('data', { ascending: true });

  type AppointmentRow = {
    id: string;
    pdr: string;
    nome_cognome: string | null;
    indirizzo: string | null;
    cap: string | null;
    citta: string | null;
    lat: number | null;
    lng: number | null;
    data: string;
    fascia_oraria: string | null;
    tipo_intervento: string | null;
    territorio_id: string | null;
    status: string;
    territories: { id: string; name: string } | null;
  };

  const appointmentTasks: Task[] = (appointmentsRaw ?? [])
    .filter((a) => a.lat !== null && a.lng !== null)
    .map((a) => ({
      id: `apt-${a.id}`,
      odl: '',
      indirizzo: a.indirizzo ?? '',
      cap: a.cap ?? '',
      citta: a.citta ?? '',
      priorita: 0,
      fascia_oraria: a.fascia_oraria ?? '',
      lat: a.lat as number,
      lng: a.lng as number,
      nominativo: a.nome_cognome ?? undefined,
      isAppointment: true,
      appointmentId: a.id,
      pdr: a.pdr,
    }));

  type AssignmentRow = {
    day_id: string;
    reperibile: boolean;
    cost_center: string | null;
    staff: { id: string; display_name: string } | null;
    territory: { id: string; name: string; lat: number | null; lng: number | null } | null;
    activity: { id: string; name: string } | null;
  };

  type RawAssignmentRow = {
    day_id: string;
    reperibile: boolean;
    cost_center: string | null;
    staff: { id: string; display_name: string } | Array<{ id: string; display_name: string }> | null;
    territory:
      | { id: string; name: string; lat: number | null; lng: number | null }
      | Array<{ id: string; name: string; lat: number | null; lng: number | null }>
      | null;
    activity: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  };

  let assignments: AssignmentRow[] = [];
  if (dayIds.length) {
    const { data } = await supabase
      .from('assignments')
      .select(`
        id, day_id, reperibile, cost_center,
        staff:staff_id ( id, display_name ),
        territory:territory_id ( id, name, lat, lng ),
        activity:activity_id ( id, name )
      `)
      .in('day_id', dayIds);

    assignments = ((data ?? []) as RawAssignmentRow[]).map((row) => ({
      ...row,
      staff: firstRelation(row.staff),
      territory: firstRelation(row.territory),
      activity: firstRelation(row.activity),
    }));
  }

  const rows: MappaStaffRow[] = assignments
    .filter((assignment) => {
      const staffId = assignment.staff?.id;
      const isoDay = dayIdMap.get(assignment.day_id) ?? '';
      return isStaffValidOnDay(staffId ? staffById.get(staffId) : null, isoDay, todayIso);
    })
    .map((a) => ({
      staffId: a.staff?.id ?? '',
      displayName: a.staff?.display_name ?? '-',
      territoryId: a.territory?.id ?? null,
      territoryName: a.territory?.name ?? null,
      activityName: a.activity?.name ?? null,
      costCenter: a.cost_center ?? null,
      day: dayIdMap.get(a.day_id) ?? '',
      reperibile: !!a.reperibile,
      lat: a.territory?.lat ?? null,
      lng: a.territory?.lng ?? null,
    }));

  // Per ogni staff: insieme dei giorni ISO in cui è reperibile nel range caricato
  const reperibileDatesMap = new Map<string, string[]>();
  assignments.forEach((a) => {
    if (a.reperibile && a.staff?.id) {
      const isoDay = dayIdMap.get(a.day_id) ?? '';
      if (!isoDay) return;
      if (!reperibileDatesMap.has(a.staff.id)) reperibileDatesMap.set(a.staff.id, []);
      reperibileDatesMap.get(a.staff.id)!.push(isoDay);
    }
  });

  const operatorOptions: MappaOperatorOption[] = staffList
    .filter((member) => isStaffRelevantForRange(member, dateFrom, dateTo, todayIso))
    .map((member) => ({
      id: member.id,
      displayName: member.display_name,
      startAddress: formatStaffStartAddress(member) || null,
      startLat: member.start_lat ?? null,
      startLng: member.start_lng ?? null,
      homeAddress: formatStaffHomeAddress(member) || null,
      homeLat: member.home_lat ?? null,
      homeLng: member.home_lng ?? null,
      reperibileDates: reperibileDatesMap.get(member.id) ?? [],
    }));

  // ── Fetch ZTL zones ───────────────────────────────────────────────────────────
  const { data: ztlZonesRaw } = await supabase
    .from('ztl_zones')
    .select('id, name, cap_list')
    .eq('active', true);

  const { data: ztlOps } = await supabase
    .from('ztl_zone_operators')
    .select('zone_id, staff_id');

  const ztlZones: ZtlZoneInfo[] = (ztlZonesRaw ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    cap_list: z.cap_list ?? [],
    authorized_staff_ids: (ztlOps ?? [])
      .filter((o) => o.zone_id === z.id)
      .map((o) => o.staff_id),
    authorized_names: (ztlOps ?? [])
      .filter((o) => o.zone_id === z.id)
      .map((o) => {
        const member = (staffList ?? []).find((s) => s.id === o.staff_id);
        return member?.display_name ?? '';
      })
      .filter(Boolean),
  }));

  // ── Fetch Allegato 10 active codes ──────────────────────────────────────────
  const { data: allegato10Rows } = await supabase
    .from('allegato10_codici')
    .select('codice')
    .eq('genera_allegato', true);

  const allegato10ActiveCodes: string[] = (allegato10Rows ?? []).map(r => r.codice);

  return (
    <MappaOperatoriClient
      rows={rows}
      operatorOptions={operatorOptions}
      territories={(territories ?? []) as Array<{ id: string; name: string; lat: number | null; lng: number | null }>}
      dateFrom={dateFrom}
      dateTo={dateTo}
      ztlZones={ztlZones}
      allegato10ActiveCodes={allegato10ActiveCodes}
      appointmentTasks={appointmentTasks}
    />
  );
}
