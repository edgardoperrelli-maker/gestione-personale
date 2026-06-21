'use client';

import { useState } from 'react';
import type { FiltroStatoLive } from '@/lib/interventi/exportFiltro';

/**
 * Pulsante + popover per esportare gli interventi in Excel su un range Dal/Al
 * libero, rispettando i filtri attivi nel Live (operatore/territorio/stato).
 */
export function EsportaExcelButton({
  defaultData,
  maxData,
  selStaff,
  selTerr,
  filtroStato,
}: {
  defaultData: string;
  maxData: string;
  selStaff: string | null;
  selTerr: string | null;
  filtroStato: FiltroStatoLive;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultData);
  const [to, setTo] = useState(defaultData);

  const scarica = () => {
    const params = new URLSearchParams({ from, to, stato: filtroStato });
    if (selStaff) params.set('staff', selStaff);
    if (selTerr) params.set('territorio', selTerr);
    window.location.href = `/api/interventi/export?${params.toString()}`;
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-xl border px-3 py-1.5 text-sm font-medium transition hover:border-[var(--brand-primary)]"
        style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
        title="Esporta gli interventi del periodo in Excel (rispetta i filtri attivi)"
      >
        Esporta Excel
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 flex flex-col gap-2 rounded-xl border p-3 shadow-lg"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
        >
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Dal
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Al
            <input type="date" value={to} min={from} max={maxData} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }} />
          </label>
          <button
            type="button"
            onClick={scarica}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-primary)' }}
          >
            Scarica
          </button>
        </div>
      )}
    </div>
  );
}
