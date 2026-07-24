'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Calendario settimanale degli appuntamenti. Testa di modulo standard
 * (ObjectHeader) con la settimana e i comandi; sotto, sette colonne-giorno con
 * drag-per-spostare. Ogni appuntamento appartiene a un committente e a un suo
 * territorio (AcquaLatina → Terracina, …), gestiti dal modulo dedicato in
 * Impostazioni; la banda della card prende il colore del committente.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import MultiSelect from '@/components/ui/MultiSelect';
import AppointmentDayCards from '@/components/modules/appuntamenti/AppointmentDayCards';
import AppointmentModal, { type Appointment } from '@/components/modules/appuntamenti/AppointmentModal';
import { addDays, fmtDay, startOfWeek } from '@/components/modules/cronoprogramma-personale/utils';
import { committentiAttivi, territoriAttivi, type AppuntamentoCommittente } from '@/lib/appuntamenti/committenti';

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
  const [committenti, setCommittenti] = useState<AppuntamentoCommittente[]>([]);
  const [filtroCommittente, setFiltroCommittente] = useState('');
  const [filtroTerritori, setFiltroTerritori] = useState<string[]>([]); // [] = tutti
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
    return () => { alive = false; };
  }, [from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Le tabelle possono non esistere finché la migrazione non è applicata:
      // in quel caso `data` è null e si resta con l'elenco vuoto.
      const { data } = await sb
        .from('appuntamenti_committenti')
        .select('id, nome, attivo, territori:appuntamenti_territori(id, committente_id, nome, attivo)')
        .order('nome', { ascending: true });
      if (alive && data) setCommittenti(data as AppuntamentoCommittente[]);
    })();
    return () => { alive = false; };
  }, [sb]);

  const committentiSel = useMemo(() => committentiAttivi(committenti), [committenti]);

  // Opzioni del filtro territori: quelli del committente scelto, o tutti (con il
  // committente in etichetta per disambiguare quando ce n'è più d'uno).
  const territoriOpzioni = useMemo(() => {
    const scope = filtroCommittente ? committentiSel.filter((c) => c.id === filtroCommittente) : committentiSel;
    const disambigua = !filtroCommittente && committentiSel.length > 1;
    return scope.flatMap((c) =>
      territoriAttivi(c).map((t) => ({ value: t.id, label: disambigua ? `${c.nome} · ${t.nome}` : t.nome })),
    );
  }, [committentiSel, filtroCommittente]);

  const appuntamentiVisibili = useMemo(
    () => appointments.filter((a) =>
      (!filtroCommittente || a.committente_id === filtroCommittente) &&
      (filtroTerritori.length === 0 || (a.appuntamento_territorio_id != null && filtroTerritori.includes(a.appuntamento_territorio_id))),
    ),
    [appointments, filtroCommittente, filtroTerritori],
  );

  const onFiltroCommittente = (id: string) => {
    setFiltroCommittente(id);
    setFiltroTerritori([]); // le opzioni territori cambiano: riparti da «tutti»
  };

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

  const title = `${days[0].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} – ${days[6].toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="space-y-4">
      <ObjectHeader
        title="Appuntamenti"
        sub={<span className="font-mono tabular-nums">{title}</span>}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Settimana precedente">
                <ChevronLeft size={16} aria-hidden />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAnchor(startOfWeek(new Date()))}>Oggi</Button>
              <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Settimana successiva">
                <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
            {committentiSel.length > 1 && (
              <div className="w-[190px]">
                <Select aria-label="Filtra per committente" className="py-1.5 text-xs" value={filtroCommittente} onChange={(e) => onFiltroCommittente(e.target.value)}>
                  <option value="">Tutti i committenti</option>
                  {committentiSel.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Select>
              </div>
            )}
            {territoriOpzioni.length > 0 && (
              <div className="w-[190px]">
                <MultiSelect
                  label="Territori"
                  ariaLabel="Filtra per territorio"
                  options={territoriOpzioni}
                  values={filtroTerritori}
                  onChange={setFiltroTerritori}
                  triggerClassName="border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] py-1.5 text-xs"
                />
              </div>
            )}
            <Button size="sm" onClick={() => { setNewAppointmentDate(undefined); setShowCreateModal(true); }}>
              <CalendarPlus size={14} aria-hidden />
              Nuovo appuntamento
            </Button>
          </>
        }
      />

      {committentiSel.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-4 py-3 text-sm text-[var(--brand-text-muted)]">
          Nessun committente configurato. Aggiungi committenti e territori da{' '}
          <a href="/impostazioni/appuntamenti-committenti" className="font-semibold text-[var(--primary-text)] hover:text-[var(--brand-primary)]">Impostazioni → Committenti appuntamenti</a>.
        </div>
      )}

      <AppointmentDayCards
        days={days}
        appointments={appuntamentiVisibili}
        onAppointmentClick={(a) => { setSelectedAppointment(a); setShowCreateModal(false); }}
        onAppointmentDrop={handleDrop}
        onNewAppointment={(date) => { setNewAppointmentDate(date); setShowCreateModal(true); }}
      />

      {selectedAppointment && (
        <AppointmentModal mode="view" appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} onDelete={handleDelete} />
      )}

      {showCreateModal && (
        <AppointmentModal
          mode="create"
          defaultDate={newAppointmentDate}
          committenti={committenti}
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
