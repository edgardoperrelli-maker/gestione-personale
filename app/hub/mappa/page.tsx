import 'leaflet/dist/leaflet.css';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import MappaOperatoriClient, {
  type MappaOperatorOption,
  type MappaStaffRow,
  type ZtlZoneInfo,
} from '@/components/modules/mappa/MappaOperatoriClient';
import RegistroPianificazioni from '@/components/modules/mappa/RegistroPianificazioni';
import { formatStaffStartAddress, formatStaffHomeAddress, isStaffRelevantForRange, isStaffValidOnDay } from '@/lib/staff';
import type { Staff } from '@/types';

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

async function MappaPageContent({
  pianoId,
}: {
  pianoId?: string;
}) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const today = new Date();
  const todayIso = fmtDay(today);
  const dateFrom = fmtDay(addDays(today, -3));
  const dateTo = fmtDay(addDays(today, 4));

  // Parallelizza le query indipendenti
  const [
    { data: territories },
    { data: calendarDays },
    { data: staffRaw },
    { data: ztlZonesRaw },
    { data: ztlOps },
    { data: allegato10Rows },
  ] = await Promise.all([
    supabase
      .from('territories')
      .select('id, name, lat, lng')
      .order('name', { ascending: true }),
    supabase
      .from('calendar_days')
      .select('id, day')
      .gte('day', dateFrom)
      .lte('day', dateTo)
      .order('day'),
    supabase
      .from('staff')
      .select('id, display_name, valid_from, valid_to, start_address, start_cap, start_city, start_lat, start_lng, home_address, home_cap, home_city, home_lat, home_lng')
      .order('display_name', { ascending: true }),
    supabase
      .from('ztl_zones')
      .select('id, name, cap_list')
      .eq('active', true),
    supabase
      .from('ztl_zone_operators')
      .select('zone_id, staff_id'),
    supabase
      .from('allegato10_codici')
      .select('codice')
      .eq('genera_allegato', true),
  ]);

  const dayIdMap = new Map<string, string>();
  (calendarDays ?? []).forEach((d) => dayIdMap.set(d.id, d.day));

  const dayIds = (calendarDays ?? []).map((d) => d.id);

  const staffList = (staffRaw ?? []) as Staff[];
  const staffById = new Map<string, Staff>();
  staffList.forEach((member) => {
    staffById.set(member.id, member);
  });

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

  // ── Costruisci ZTL zones dai risultati parallelizzati ────────────────────────
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

  // ── Costruisci Allegato 10 active codes dai risultati parallelizzati ────────
  const allegato10ActiveCodes: string[] = (allegato10Rows ?? []).map(r => r.codice);

  // Fetch saved piano if pianoId is provided
  let initialPianoId: string | undefined;
  let initialDistribution: Record<string, any> = {};

  if (pianoId) {
    const { data: pianoData } = await supabase
      .from('mappa_piani')
      .select(`
        id,
        data,
        territorio,
        note,
        mappa_piani_operatori (
          staff_id,
          staff_name,
          colore,
          km,
          task_count,
          start_address,
          tasks,
          polyline
        )
      `)
      .eq('id', pianoId)
      .single();

    if (pianoData) {
      initialPianoId = pianoData.id;
      // Reconstruct initialDistribution from saved operators
      const operators = pianoData.mappa_piani_operatori || [];
      operators.forEach((op: any) => {
        const key = `${op.staff_id}|${pianoData.territorio}`;
        initialDistribution[key] = {
          staff_id: op.staff_id,
          staff_name: op.staff_name,
          colore: op.colore,
          km: op.km,
          task_count: op.task_count,
          start_address: op.start_address,
          tasks: op.tasks,
          polyline: op.polyline,
        };
      });
    }
  }

  return (
    <MappaOperatoriClient
      rows={rows}
      operatorOptions={operatorOptions}
      territories={(territories ?? []) as Array<{ id: string; name: string; lat: number | null; lng: number | null }>}
      dateFrom={dateFrom}
      dateTo={dateTo}
      ztlZones={ztlZones}
      allegato10ActiveCodes={allegato10ActiveCodes}
      initialPianoId={initialPianoId}
      initialDistribution={Object.keys(initialDistribution).length > 0 ? initialDistribution : undefined}
    />
  );
}

export default async function MappaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pianoId?: string }>;
}) {
  const params = await searchParams;
  const vista = params.vista ?? 'pianifica';
  const pianoId = params.pianoId;

  const navButtonClass = (isActive: boolean) =>
    `rounded-lg px-4 py-1.5 text-sm font-medium transition ${
      isActive
        ? 'bg-[var(--brand-primary)] text-white shadow-sm'
        : 'text-[var(--brand-text-muted)] hover:bg-gray-50'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-[var(--brand-border)] bg-white p-1 w-fit shadow-sm">
        <a href="/hub/mappa?vista=pianifica" className={navButtonClass(vista !== 'registro')}>
          Pianificazione indirizzi
        </a>
        <a href="/hub/mappa?vista=registro" className={navButtonClass(vista === 'registro')}>
          Registro pianificazioni
        </a>
      </div>

      {vista === 'registro' ? (
        <RegistroPianificazioni />
      ) : (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)]">
              Caricamento mappa...
            </div>
          }
        >
          <MappaPageContent pianoId={pianoId} />
        </Suspense>
      )}
    </div>
  );
}
