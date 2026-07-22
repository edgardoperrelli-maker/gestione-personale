'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import DatePicker from '@/components/ui/DatePicker';
import { TIPI_ASSENZA, TIPO_META, type Disponibilita, type TipoAssenza } from '@/lib/disponibilita';
import type { Staff } from '@/types';

type ModoOrario = 'intera' | 'fino' | 'dalle' | 'finestra';

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

function modoFrom(existing?: Disponibilita | null): ModoOrario {
  if (!existing || (!existing.ora_da && !existing.ora_a)) return 'intera';
  if (existing.ora_da && existing.ora_a) return 'finestra';
  if (existing.ora_a) return 'fino';
  return 'dalle';
}

export default function AssenzaDialog({
  open,
  staffList,
  defaultDate,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  staffList: Staff[];
  defaultDate: string;
  existing?: Disponibilita | null;
  onClose: () => void;
  onSaved: (d: Disponibilita) => void;
  onDeleted: (id: string) => void;
}) {
  const isEdit = !!existing;
  const [staffId, setStaffId] = useState(existing?.staff_id ?? '');
  const [data, setData] = useState(existing?.data ?? defaultDate);
  const [tipo, setTipo] = useState<TipoAssenza>(existing?.tipo ?? 'ferie');
  const [modo, setModo] = useState<ModoOrario>(modoFrom(existing));
  const [oraDa, setOraDa] = useState(hhmm(existing?.ora_da ?? null));
  const [oraA, setOraA] = useState(hhmm(existing?.ora_a ?? null));
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const computeOrari = (): { ora_da: string | null; ora_a: string | null } => {
    if (modo === 'intera') return { ora_da: null, ora_a: null };
    if (modo === 'fino') return { ora_da: null, ora_a: oraA || null };
    if (modo === 'dalle') return { ora_da: oraDa || null, ora_a: null };
    return { ora_da: oraDa || null, ora_a: oraA || null };
  };

  const save = async () => {
    setError(null);
    if (!staffId || !data) {
      setError('Seleziona operatore e data.');
      return;
    }
    const { ora_da, ora_a } = computeOrari();
    if (modo === 'fino' && !ora_a) return setError('Indica l’ora di fine disponibilità.');
    if (modo === 'dalle' && !ora_da) return setError('Indica l’ora di inizio disponibilità.');
    if (modo === 'finestra' && (!ora_da || !ora_a)) return setError('Indica inizio e fine finestra.');
    if (ora_da && ora_a && ora_da >= ora_a) return setError('L’ora di inizio deve precedere quella di fine.');

    setSaving(true);
    try {
      const res = await fetch('/api/disponibilita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, data, tipo, ora_da, ora_a, note: note || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Salvataggio non riuscito.');
        return;
      }
      const saved = (await res.json()) as Disponibilita;
      onSaved(saved);
    } catch {
      setError('Errore di rete nel salvataggio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/disponibilita?id=${existing.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(existing.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-2xl">
        <div className="text-lg font-semibold text-[var(--brand-text-main)]">
          {isEdit ? 'Modifica assenza / disponibilità' : 'Assenza / Disponibilità'}
        </div>

        {/* Operatore */}
        <label className="mt-4 block text-xs font-semibold text-[var(--brand-text-muted)]">Operatore</label>
        <select
          value={staffId}
          disabled={isEdit}
          onChange={(e) => setStaffId(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="">— seleziona —</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.display_name}</option>
          ))}
        </select>

        {/* Data */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Data</label>
        <div className="mt-1">
          <DatePicker value={data} onChange={setData} disabled={isEdit} fullWidth />
        </div>

        {/* Tipo */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Tipo</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TIPI_ASSENZA.map((t) => {
            const meta = TIPO_META[t];
            const active = tipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  backgroundColor: active ? meta.bg : 'transparent',
                  borderColor: active ? meta.border : 'var(--brand-border)',
                  color: active ? meta.text : 'var(--brand-text-muted)',
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Modalità orario */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Disponibilità</label>
        <div className="mt-1 grid grid-cols-2 gap-1.5 text-sm">
          {([
            ['intera', 'Tutto il giorno'],
            ['fino', 'Disponibile fino alle…'],
            ['dalle', 'Disponibile dalle…'],
            ['finestra', 'Finestra…'],
          ] as [ModoOrario, string][]).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setModo(val)}
              className={`rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                modo === val
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-text-main)]'
                  : 'border-[var(--brand-border)] text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Campi orario contestuali */}
        {(modo === 'dalle' || modo === 'finestra') && (
          <div className="mt-2">
            <label className="block text-xs text-[var(--brand-text-muted)]">Dalle</label>
            <input type="time" value={oraDa} onChange={(e) => setOraDa(e.target.value)}
              className="mt-1 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />
          </div>
        )}
        {(modo === 'fino' || modo === 'finestra') && (
          <div className="mt-2">
            <label className="block text-xs text-[var(--brand-text-muted)]">Fino alle</label>
            <input type="time" value={oraA} onChange={(e) => setOraA(e.target.value)}
              className="mt-1 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />
          </div>
        )}

        {/* Note */}
        <label className="mt-3 block text-xs font-semibold text-[var(--brand-text-muted)]">Note (opzionale)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm" />

        {error && <div className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {isEdit && (
              <Button variant="outline" onClick={remove} disabled={saving}>Elimina</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
            <Button variant="primary" onClick={save} disabled={saving}>Salva</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
