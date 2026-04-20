'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Button from '@/components/Button';
import { getTerritoryStyle } from '@/lib/territoryColors';
import { isTerritoryValidOnDay } from '@/lib/territories';
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

type Props =
  | {
      mode: 'view';
      appointment: Appointment;
      onClose: () => void;
      onDelete: (id: string) => void;
    }
  | {
      mode: 'create';
      defaultDate?: string;
      territories: Territory[];
      onClose: () => void;
      onCreate: (appointment: Appointment) => void;
    };

export default function AppointmentModal(props: Props) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [props]);

  if (props.mode === 'view') {
    return <ViewMode {...props} />;
  } else {
    return <CreateMode {...props} />;
  }
}

function ViewMode({
  appointment,
  onClose,
  onDelete,
}: {
  mode: 'view';
  appointment: Appointment;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const terrStyle = getTerritoryStyle(appointment.territories?.name);

  const handleDelete = async () => {
    if (!window.confirm('Sei sicuro di voler eliminare questo appuntamento?')) return;

    setDeleting(true);
    const res = await fetch(`/api/appointments?id=${appointment.id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      alert('Errore durante l\'eliminazione');
      setDeleting(false);
      return;
    }

    onDelete(appointment.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--brand-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banda colorata sinistra */}
        <div
          className="h-2"
          style={{ backgroundColor: terrStyle.band }}
        />

        {/* Header */}
        <div className="border-b border-[var(--brand-border)] px-6 py-4">
          <div className="text-lg font-semibold text-[var(--brand-text-main)]">
            {appointment.pdr}
          </div>
          {appointment.nome_cognome && (
            <div className="text-sm text-[var(--brand-text-muted)]">
              {appointment.nome_cognome}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Data e fascia oraria */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Data
              </label>
              <div className="text-sm text-[var(--brand-text-main)]">
                {new Date(appointment.data + 'T00:00:00').toLocaleDateString('it-IT', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>
            {appointment.fascia_oraria && (
              <div>
                <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                  Fascia oraria
                </label>
                <div className="text-sm text-[var(--brand-text-main)]">
                  {appointment.fascia_oraria}
                </div>
              </div>
            )}
          </div>

          {/* Tipo intervento */}
          {appointment.tipo_intervento && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Tipo intervento
              </label>
              <div className="text-sm text-[var(--brand-text-main)]">
                {appointment.tipo_intervento}
              </div>
            </div>
          )}

          {/* Territorio */}
          {appointment.territories && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Territorio
              </label>
              <div className="text-sm text-[var(--brand-text-main)]">
                {appointment.territories.name}
              </div>
            </div>
          )}

          {/* Indirizzo */}
          {(appointment.indirizzo || appointment.cap || appointment.citta) && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Indirizzo
              </label>
              <div className="text-sm text-[var(--brand-text-main)]">
                {[appointment.indirizzo, appointment.cap, appointment.citta]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>
          )}

          {/* Note */}
          {appointment.note && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Note
              </label>
              <div className="text-sm text-[var(--brand-text-main)]">
                {appointment.note}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Status
            </label>
            <div className="text-sm text-[var(--brand-text-main)]">
              {appointment.status === 'pending' ? 'In sospeso' : 'Confermato'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-6 py-4">
          <Button variant="outline" onClick={onClose} size="sm">
            Chiudi
          </Button>
          <Button
            variant="outline"
            onClick={handleDelete}
            size="sm"
            disabled={deleting}
          >
            {deleting ? 'Eliminando...' : 'Elimina'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateMode({
  defaultDate,
  territories,
  onClose,
  onCreate,
}: {
  mode: 'create';
  defaultDate?: string;
  territories: Territory[];
  onClose: () => void;
  onCreate: (appointment: Appointment) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pdr, setPdr] = useState('');
  const [nomeCognome, setNomeCognome] = useState('');
  const [data, setData] = useState(defaultDate || '');
  const [fasciaOraria, setFasciaOraria] = useState('');
  const [tipoIntervento, setTipoIntervento] = useState('');
  const [territorioId, setTerritorioId] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState('');
  const [citta, setCitta] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const todayIso = useMemo(
    () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
    []
  );
  const availableTerritories = useMemo(() => {
    if (!data) {
      return territories
        .filter((territory) => territory.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
    }

    return territories
      .filter((territory) => isTerritoryValidOnDay(territory, data, todayIso))
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }, [data, territories, todayIso]);

  useEffect(() => {
    if (!territorioId) return;
    if (availableTerritories.some((territory) => territory.id === territorioId)) return;
    setTerritorioId('');
  }, [availableTerritories, territorioId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pdr.trim()) {
      alert('PDR obbligatorio');
      return;
    }
    if (!data.trim()) {
      alert('Data obbligatoria');
      return;
    }

    setLoading(true);

    const lat: number | null = null;
    const lng: number | null = null;

    // Geocodifica se indirizzo compilato
    if (indirizzo.trim() || cap.trim() || citta.trim()) {
      try {
        // In produzione useremmo una vera API di geocoding
        // Per ora skippiamo il geocoding
      } catch (err) {
        console.error('Geocoding error:', err);
      }
    }

    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdr: pdr.trim(),
        nome_cognome: nomeCognome.trim() || null,
        data: data.trim(),
        fascia_oraria: fasciaOraria.trim() || null,
        tipo_intervento: tipoIntervento.trim() || null,
        territorio_id: territorioId || null,
        indirizzo: indirizzo.trim() || null,
        cap: cap.trim() || null,
        citta: citta.trim() || null,
        note: note.trim() || null,
        lat,
        lng,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(`Errore: ${err.error || 'Errore sconosciuto'}`);
      return;
    }

    const json = await res.json() as { appointment?: Appointment };
    if (json.appointment) {
      onCreate(json.appointment);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--brand-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-[var(--brand-border)] px-6 py-4">
          <div className="text-lg font-semibold text-[var(--brand-text-main)]">
            Nuovo appuntamento
          </div>
        </div>

        {/* Body */}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {/* PDR */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              PDR *
            </label>
            <input
              type="text"
              value={pdr}
              onChange={(e) => setPdr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              placeholder="Inserisci PDR"
            />
          </div>

          {/* Nome Cognome */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Nome e cognome
            </label>
            <input
              type="text"
              value={nomeCognome}
              onChange={(e) => setNomeCognome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              placeholder="Nome e cognome"
            />
          </div>

          {/* Data */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Data *
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
            />
          </div>

          {/* Fascia oraria */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Fascia oraria
            </label>
            <input
              type="text"
              value={fasciaOraria}
              onChange={(e) => setFasciaOraria(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              placeholder="es. 08:00-12:00"
            />
          </div>

          {/* Tipo intervento */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Tipo intervento
            </label>
            <input
              type="text"
              value={tipoIntervento}
              onChange={(e) => setTipoIntervento(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              placeholder="Tipo intervento"
            />
          </div>

          {/* Territorio */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Territorio
            </label>
            <select
              value={territorioId}
              onChange={(e) => setTerritorioId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
            >
              <option value="">Nessun territorio</option>
              {availableTerritories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Indirizzo, CAP, Città */}
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Indirizzo
              </label>
              <input
                type="text"
                value={indirizzo}
                onChange={(e) => setIndirizzo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                placeholder="Indirizzo"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                CAP
              </label>
              <input
                type="text"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                placeholder="CAP"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
                Città
              </label>
              <input
                type="text"
                value={citta}
                onChange={(e) => setCitta(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                placeholder="Città"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[11px] font-semibold text-[var(--brand-text-muted)]">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              rows={3}
              placeholder="Note aggiuntive"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-6 py-4">
          <Button variant="outline" onClick={onClose} size="sm">
            Annulla
          </Button>
          <Button
            onClick={() => {
              formRef.current?.requestSubmit();
            }}
            size="sm"
            disabled={loading}
          >
            {loading ? 'Creando...' : 'Crea'}
          </Button>
        </div>
      </div>
    </div>
  );
}
