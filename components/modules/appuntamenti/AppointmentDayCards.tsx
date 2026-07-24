'use client';

import { coloreCommittente } from '@/lib/appuntamenti/committenti';
import { fmtDay } from '@/components/modules/cronoprogramma-personale/utils';
import type { Appointment } from './AppointmentModal';

type Props = {
  days: Date[];
  appointments: Appointment[];
  onAppointmentClick: (a: Appointment) => void;
  onAppointmentDrop: (appointmentId: string, newDate: string) => void;
  onNewAppointment: (date: string) => void;
};

export default function AppointmentDayCards({
  days,
  appointments,
  onAppointmentClick,
  onAppointmentDrop,
  onNewAppointment,
}: Props) {
  if (days.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((d) => {
        const dayStr = fmtDay(d);
        const dayAppointments = appointments.filter((a) => a.data === dayStr);

        return (
          <div
            key={dayStr}
            className="flex min-h-[150px] flex-col rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-appointment-id')) e.preventDefault();
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-appointment-id');
              if (!id) return;
              e.preventDefault();
              onAppointmentDrop(id, dayStr);
            }}
          >
            {/* Testa giorno */}
            <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-2.5 py-1.5">
              <span className="text-xs font-semibold capitalize text-[var(--brand-text-main)]">
                {d.toLocaleDateString('it-IT', { weekday: 'short' })} <span className="font-mono tabular-nums">{d.getDate()}</span>
              </span>
              <button
                type="button"
                onClick={() => onNewAppointment(dayStr)}
                aria-label={`Nuovo appuntamento il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`}
                title="Nuovo appuntamento"
                className="inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--brand-text-muted)] transition-colors hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                +
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 space-y-0.5 overflow-y-auto p-1">
              {dayAppointments.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onClick={() => onAppointmentClick(a)}
                  onDragStart={(e) => e.dataTransfer.setData('application/x-appointment-id', a.id)}
                  className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs transition-colors hover:bg-[var(--brand-surface-muted)]"
                  style={{ borderLeft: `3px solid ${coloreCommittente(a.committente_id ?? a.committente?.nome)}` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-[var(--brand-text-main)]">{a.pdr}</span>
                    {a.fascia_oraria && (
                      <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-[var(--brand-text-muted)]">{a.fascia_oraria}</span>
                    )}
                  </div>
                  {(a.committente?.nome || a.appuntamento_territorio?.nome) && (
                    <div className="truncate text-[11px] text-[var(--brand-text-muted)]">
                      {[a.committente?.nome, a.appuntamento_territorio?.nome].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
              {dayAppointments.length === 0 && (
                <div className="flex h-full items-center justify-center text-[11px] text-[var(--brand-text-subtle)]">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
