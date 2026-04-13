'use client';

import { getTerritoryStyle } from '@/lib/territoryColors';
import { fmtDay } from './utils';

type AppointmentTerritory = { id: string; name: string } | null;

type Appointment = {
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
  note: string | null;
  status: 'pending' | 'confirmed';
  territories: AppointmentTerritory;
};

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
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const dayStr = fmtDay(d);
        const dayAppointments = appointments.filter((a) => a.data === dayStr);

        return (
          <div
            key={dayStr}
            className="flex h-[140px] flex-col rounded-xl border border-[var(--brand-border)] bg-white shadow-sm"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-appointment-id')) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-appointment-id');
              if (!id) return;
              e.preventDefault();
              onAppointmentDrop(id, dayStr);
            }}
          >
            {/* Header card */}
            <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-2 py-1.5">
              <span className="text-xs font-semibold text-[var(--brand-text-main)]">
                {d.toLocaleDateString('it-IT', { weekday: 'short' })} {d.getDate()}
              </span>
              <span className="rounded-full bg-[var(--brand-primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
                {dayAppointments.length}
              </span>
            </div>

            {/* Lista scrollabile */}
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
              {dayAppointments.map((a) => {
                const terrStyle = getTerritoryStyle(a.territories?.name);
                return (
                  <div
                    key={a.id}
                    draggable
                    onClick={() => onAppointmentClick(a)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-appointment-id', a.id);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs hover:opacity-80"
                    style={{
                      backgroundColor: terrStyle.bg,
                      borderLeft: `3px solid ${terrStyle.band}`,
                    }}
                    title={a.nome_cognome ?? a.pdr}
                  >
                    <span className="font-semibold truncate">{a.pdr}</span>
                    {a.fascia_oraria && (
                      <span className="ml-auto shrink-0 text-[10px] opacity-60">
                        {a.fascia_oraria}
                      </span>
                    )}
                  </div>
                );
              })}
              {dayAppointments.length === 0 && (
                <div className="flex h-full items-center justify-center text-[10px] text-[var(--brand-text-muted)]">
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
