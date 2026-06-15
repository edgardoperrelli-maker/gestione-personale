'use client';

import Link from 'next/link';
import { fmtDay } from './utils';
import { countAppointmentsByDay } from '@/lib/appuntamenti';

export default function AppointmentCountStrip({
  days,
  appointments,
}: {
  days: Date[];
  appointments: { data: string }[];
}) {
  if (days.length === 0) return null;
  const isoDays = days.map(fmtDay);
  const counts = countAppointmentsByDay(appointments, isoDays);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const iso = fmtDay(d);
        const n = counts[iso] ?? 0;
        return (
          <Link
            key={iso}
            href={`/hub/appuntamenti?date=${iso}`}
            title={`${n} appuntament${n === 1 ? 'o' : 'i'} — apri il modulo Appuntamenti`}
            className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs shadow-sm transition hover:border-[var(--brand-primary-border)] hover:bg-[var(--brand-surface-muted)]"
          >
            <span className="font-semibold text-[var(--brand-text-main)]">
              {d.toLocaleDateString('it-IT', { weekday: 'short' })} {d.getDate()}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                n > 0
                  ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                  : 'text-[var(--brand-text-muted)]'
              }`}
            >
              {n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
