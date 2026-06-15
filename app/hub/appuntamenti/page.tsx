'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import Button from '@/components/Button';
import AppointmentDayCards from '@/components/modules/appuntamenti/AppointmentDayCards';
import AppointmentModal from '@/components/modules/appuntamenti/AppointmentModal';
import { addDays, fmtDay, startOfWeek } from '@/components/modules/cronoprogramma-personale/utils';
import type { Territory } from '@/types';

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

function parseDateParam(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function AppuntamentiInner() {
  const sb = supabaseBrowser();
  const searchParams = useSearchParams();

  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(parseDateParam(searchParams.get('date'))));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>(undefined);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const from = fmtDay(days[0]);
  const to = fmtDay(days[6]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
        const json = (await res.json()) as { appointments?: Appointment[] };
        if (alive && json.appointments) setAppointments(json.appointments);
      } catch (e) {
        console.error('Errore fetch appuntamenti:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb.from('territories').select('*').order('name', { ascending: true });
      if (alive && data) setTerritories(data as Territory[]);
    })();
    return () => {
      alive = false;
    };
  }, [sb]);

  const handleDrop = async (appointmentId: string, newDate: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appointmentId, data: newDate }),
    });
    const json = (await res.json()) as { appointment?: Appointment };
    if (!res.ok || !json.appointment) return;
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? json.appointment! : a)));
  };

  const handleDelete = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setSelectedAppointment(null);
  };

  const handleCreated = (newAppt: Appointment) => {
    setAppointments((prev) => [...prev, newAppt].sort((a, b) => a.data.localeCompare(b.data)));
    setShowCreateModal(false);
    setNewAppointmentDate(undefined);
  };

  const title = `${days[0].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} - ${days[6].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 shadow-sm">
        <Button size="sm" onClick={() => setAnchor((a) => addDays(a, -7))}>{'<'}</Button>
        <div className="text-lg font-semibold tracking-tight">{title}</div>
        <Button size="sm" onClick={() => setAnchor((a) => addDays(a, 7))}>{'>'}</Button>
        <Button size="sm" variant="soft" onClick={() => setAnchor(startOfWeek(new Date()))}>Oggi</Button>
        <div className="ml-auto">
          <Button size="sm" onClick={() => { setNewAppointmentDate(undefined); setShowCreateModal(true); }}>
            + Nuovo appuntamento
          </Button>
        </div>
      </div>

      <AppointmentDayCards
        days={days}
        appointments={appointments}
        onAppointmentClick={(a) => { setSelectedAppointment(a); setShowCreateModal(false); }}
        onAppointmentDrop={handleDrop}
        onNewAppointment={(date) => { setNewAppointmentDate(date); setShowCreateModal(true); }}
      />

      {selectedAppointment && (
        <AppointmentModal
          mode="view"
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onDelete={handleDelete}
        />
      )}

      {showCreateModal && (
        <AppointmentModal
          mode="create"
          defaultDate={newAppointmentDate}
          territories={territories}
          onClose={() => { setShowCreateModal(false); setNewAppointmentDate(undefined); }}
          onCreate={handleCreated}
        />
      )}
    </div>
  );
}

export default function AppuntamentiPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-[var(--brand-text-muted)]">Caricamento…</div>}>
      <AppuntamentiInner />
    </Suspense>
  );
}
