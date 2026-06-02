'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { labelStato, badgeGeocode, type InterventoRow } from '@/lib/interventi/interventiView';

type Operatore = { id: string; display_name: string };

const TONE_STYLE: Record<'success' | 'danger' | 'muted', { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  muted: { bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const TERMINALI = new Set(['completato', 'annullato']);
const TH = 'px-3 py-2 text-left font-semibold';
const TD = 'px-3 py-2';
const fieldStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' };

export default function InterventiAssegnabili({
  rows,
  operators,
}: {
  rows: InterventoRow[];
  operators: Operatore[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStaff, setBulkStaff] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const assegnabili = rows.filter((r) => !TERMINALI.has(r.stato ?? ''));
  const tuttiSelezionati = assegnabili.length > 0 && assegnabili.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(tuttiSelezionati ? new Set() : new Set(assegnabili.map((r) => r.id)));
  }

  async function assegna(ids: string[], staffId: string | null) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setAvviso(null);
    try {
      const res = await fetch('/api/interventi/assegna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, staffId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore assegnazione.');
        return;
      }
      const scartati = Array.isArray(json?.scartati) ? json.scartati.length : 0;
      if (scartati > 0) setAvviso(`${json.assegnati} assegnati, ${scartati} non assegnabili (completati/annullati).`);
      setSelected(new Set());
      setBulkStaff('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
      >
        Nessun intervento per i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {avviso && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          {avviso}
        </div>
      )}

      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            {selected.size} selezionati
          </span>
          <select
            aria-label="Operatore per assegnazione massiva"
            value={bulkStaff}
            onChange={(e) => setBulkStaff(e.target.value)}
            className="rounded-2xl border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
          >
            <option value="">— Operatore</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.display_name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || bulkStaff === ''}
            onClick={() => assegna([...selected], bulkStaff)}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {busy ? '…' : `Assegna ${selected.size}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelected(new Set())}
            className="rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            Annulla selezione
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[28px] border" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--brand-text-muted)' }}>
              <th className={TD}>
                <input
                  type="checkbox"
                  aria-label="Seleziona tutti"
                  checked={tuttiSelezionati}
                  onChange={toggleAll}
                  disabled={assegnabili.length === 0}
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
              </th>
              <th className={TH}>ODL</th>
              <th className={TH}>Indirizzo</th>
              <th className={TH}>Comune</th>
              <th className={TH}>Committente</th>
              <th className={TH}>Stato</th>
              <th className={TH}>Geocodifica</th>
              <th className={TH}>Operatore</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = badgeGeocode(r.geocode_status);
              const tone = TONE_STYLE[g.tone];
              const terminale = TERMINALI.has(r.stato ?? '');
              return (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      aria-label={`Seleziona ${r.odl ?? r.id}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={terminale || busy}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                  </td>
                  <td className={TD}>{r.odl ?? '—'}</td>
                  <td className={TD}>{r.indirizzo ?? '—'}</td>
                  <td className={TD}>{r.comune ?? '—'}</td>
                  <td className={TD}>{r.committente ?? '—'}</td>
                  <td className={TD}>{labelStato(r.stato)}</td>
                  <td className={TD}>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: tone.bg, color: tone.fg }}>
                      {g.label}
                    </span>
                  </td>
                  <td className={TD}>
                    {terminale ? (
                      <span style={{ color: 'var(--brand-text-muted)' }}>
                        {operators.find((o) => o.id === r.staff_id)?.display_name ?? '—'}
                      </span>
                    ) : (
                      <select
                        aria-label={`Operatore per ${r.odl ?? r.id}`}
                        value={r.staff_id ?? ''}
                        onChange={(e) => {
                          const next = e.target.value === '' ? null : e.target.value;
                          if (next === (r.staff_id ?? null)) return;
                          void assegna([r.id], next);
                        }}
                        disabled={busy}
                        className="rounded-xl border px-2 py-1 text-sm outline-none"
                        style={fieldStyle}
                      >
                        <option value="">— Non assegnato</option>
                        {r.staff_id && !operators.some((o) => o.id === r.staff_id) && (
                          <option value={r.staff_id}>Operatore {r.staff_id}</option>
                        )}
                        {operators.map((o) => (
                          <option key={o.id} value={o.id}>{o.display_name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
