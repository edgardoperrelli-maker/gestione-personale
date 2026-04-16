import 'leaflet/dist/leaflet.css';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
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
  let initialDistribution: any[] | undefined = undefined;
  let initialPianoId: string | undefined = undefined;

  if (pianoId) {
    const { data: opRows } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('staff_id, staff_name, colore, km, task_count, start_address, tasks, polyline')
      .eq('piano_id', pianoId);

    if (opRows && opRows.length > 0) {
      initialPianoId = pianoId;
      initialDistribution = opRows.map((op: any) => ({
        op: (op.staff_name ?? op.staff_id ?? 'Operatore').trim(),
        staffId: op.staff_id ?? '',
        color: op.colore ?? '#2563EB',
        tasks: Array.isArray(op.tasks) ? op.tasks : [],
        km: Number(op.km ?? 0),
        polyline: Array.isArray(op.polyline) ? op.polyline : [],
        base: null,
        startAddress: op.start_address ?? null,
      }));
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
      initialDistribution={initialDistribution}
    />
  );
}

export default async function MappaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pianoId?: string }>;
}) {
  const params = await searchParams;
  const vista = params.vista ?? '';
  const pianoId = params.pianoId;

  return (
    <div className="space-y-6">

      {/* Landing — solo card, nessun contenuto */}
      {vista === '' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="/hub/mappa?vista=pianifica"
            className="group rounded-2xl border border-[var(--brand-border)]
                       bg-white p-5 shadow-sm transition
                       hover:border-blue-200 hover:shadow"
          >
            <div className="flex h-11 w-11 items-center justify-center
                            rounded-xl bg-[var(--brand-primary-soft)]
                            text-[var(--brand-primary)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
                   stroke="currentColor" strokeWidth="1.6">
                <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
            </div>
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Pianificazione indirizzi</h2>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
                Distribuzione territoriale operatori
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold
                            text-[var(--brand-primary)]">
              <span>Apri</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </a>

          <a
            href="/hub/mappa?vista=registro"
            className="group rounded-2xl border border-[var(--brand-border)]
                       bg-white p-5 shadow-sm transition
                       hover:border-blue-200 hover:shadow"
          >
            <div className="flex h-11 w-11 items-center justify-center
                            rounded-xl bg-[var(--brand-primary-soft)]
                            text-[var(--brand-primary)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
                   stroke="currentColor" strokeWidth="1.6">
                <path d="M6 2h9l5 5v15H6z"/>
                <path d="M15 2v5h5"/>
                <path d="M9 13h6M9 17h6"/>
              </svg>
            </div>
            <div className="mt-4">
              <h2 className="text-lg font-semibold">Registro pianificazioni</h2>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
                Storico e gestione piani salvati
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold
                            text-[var(--brand-primary)]">
              <span>Apri</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </a>
        </div>
      )}

      {/* Modulo pianificazione — a schermo pieno, no card */}
      {vista === 'pianifica' && (
        <div className="relative">
          <Suspense
            fallback={
              <div className="rounded-2xl border border-[var(--brand-border)]
                              bg-white p-8 text-center text-sm
                              text-[var(--brand-text-muted)]">
                Caricamento mappa...
              </div>
            }
          >
            <MappaPageContent pianoId={pianoId} />
          </Suspense>
        </div>
      )}

      {/* Modulo registro — a schermo pieno, no card */}
      {vista === 'registro' && (
        <RegistroPianificazioni />
      )}

    </div>
  );
}
