'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { operatorNeedsHotelForTerritory } from '@/lib/trasferte';
import type { Territory } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TerritoryRelation = { id: string; name: string };
type StaffRelation = { id: string; display_name: string; home_territory_id?: string | null };
type AssignmentRow = {
  staff_id: string | null;
  territory_id: string | null;
  territory?: TerritoryRelation | TerritoryRelation[] | null;
  staff?: StaffRelation | StaffRelation[] | null;
};
type BookingGuest = { id?: unknown };
type BookingRow = {
  territory_id: string | null;
  guests?: unknown;
};
type AlertItem = { territory_name: string; territory_id: string; uncovered: string[] };

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeekMonday(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(result, diff);
}

function yyyyMmDd(date: Date) {
  return date.toLocaleDateString('sv-SE');
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function guestIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const candidate = item as BookingGuest;
    const id = String(candidate?.id ?? '').trim();
    return id ? [id] : [];
  });
}

export default function TrasfertaAlert() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function checkNextWeek() {
      setLoading(true);
      try {
        const today = new Date();
        const nextWeekStart = startOfWeekMonday(addDays(today, 7));
        const nextWeekEnd = addDays(nextWeekStart, 6);
        const from = yyyyMmDd(nextWeekStart);
        const to = yyyyMmDd(nextWeekEnd);

        const { data: calendarDays } = await supabase
          .from('calendar_days')
          .select('id')
          .gte('day', from)
          .lte('day', to);
        const dayIds = ((calendarDays ?? []) as { id: string }[]).map((day) => day.id);
        if (!dayIds.length) {
          if (alive) setAlerts([]);
          return;
        }

        const { data: assignments } = await supabase
          .from('assignments')
          .select('staff_id, territory_id, territory:territory_id(id,name), staff:staff_id(id,display_name,home_territory_id)')
          .in('day_id', dayIds)
          .not('territory_id', 'is', null);

        const { data: territoriesRaw } = await supabase
          .from('territories')
          .select('id, name, active')
          .order('name');
        const territories = (territoriesRaw ?? []) as Territory[];

        const byTerritory: Record<string, { name: string; staffIds: Set<string>; staffNames: Record<string, string> }> = {};
        for (const assignment of ((assignments ?? []) as AssignmentRow[])) {
          const territory = firstRelation(assignment.territory);
          const staff = firstRelation(assignment.staff);
          if (!assignment.territory_id || !assignment.staff_id || !staff) continue;
          if (!operatorNeedsHotelForTerritory(staff.home_territory_id, assignment.territory_id, territories)) continue;
          if (!byTerritory[assignment.territory_id]) {
            byTerritory[assignment.territory_id] = {
              name: territory?.name ?? '',
              staffIds: new Set<string>(),
              staffNames: {},
            };
          }
          byTerritory[assignment.territory_id].staffIds.add(assignment.staff_id);
          byTerritory[assignment.territory_id].staffNames[assignment.staff_id] = staff.display_name;
        }

        const territoryIds = Object.keys(byTerritory);
        if (!territoryIds.length) {
          if (alive) setAlerts([]);
          return;
        }

        const { data: bookings } = await supabase
          .from('hotel_bookings')
          .select('territory_id, guests')
          .gte('date', from)
          .lte('date', to)
          .not('territory_id', 'is', null);

        const covered: Record<string, Set<string>> = {};
        for (const booking of ((bookings ?? []) as BookingRow[])) {
          if (!booking.territory_id) continue;
          if (!covered[booking.territory_id]) covered[booking.territory_id] = new Set<string>();
          for (const id of guestIds(booking.guests)) covered[booking.territory_id].add(id);
        }

        const result: AlertItem[] = [];
        for (const [territoryId, info] of Object.entries(byTerritory)) {
          const coveredSet = covered[territoryId] ?? new Set<string>();
          const uncovered = [...info.staffIds]
            .filter((staffId) => !coveredSet.has(staffId))
            .map((staffId) => info.staffNames[staffId] ?? staffId);
          if (uncovered.length > 0) {
            result.push({ territory_id: territoryId, territory_name: info.name, uncovered });
          }
        }

        if (alive) setAlerts(result);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void checkNextWeek();
    return () => {
      alive = false;
    };
  }, []);

  if (loading || alerts.length === 0) return null;

  const nextMonday = startOfWeekMonday(addDays(new Date(), 7));
  const nextSunday = addDays(nextMonday, 6);
  const fmt = (date: Date) => date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl text-amber-500">!</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">
            Trasferte settimana {fmt(nextMonday)}-{fmt(nextSunday)}: prenotazioni hotel mancanti
          </p>
          <div className="mt-2 space-y-2">
            {alerts.map((alert) => (
              <div key={alert.territory_id} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">{alert.territory_name}</div>
                <div className="mt-0.5 text-xs text-neutral-700">
                  {alert.uncovered.length === 1
                    ? `${alert.uncovered[0]} non ha prenotazione hotel`
                    : `${alert.uncovered.length} operatori senza prenotazione: ${alert.uncovered.join(', ')}`}
                </div>
              </div>
            ))}
          </div>
          <Link href="/hub/hotel-calendar" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white">
            Gestisci prenotazioni -&gt;
          </Link>
        </div>
      </div>
    </div>
  );
}
