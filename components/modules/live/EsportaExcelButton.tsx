'use client';

import { useEffect, useRef, useState } from 'react';
import type { FiltroStatoLive } from '@/lib/interventi/exportFiltro';
import Button from '@/components/Button';
import DatePicker from '@/components/ui/DatePicker';

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const scarica = () => {
    const params = new URLSearchParams({ from, to, stato: filtroStato });
    if (selStaff) params.set('staff', selStaff);
    if (selTerr) params.set('territorio', selTerr);
    window.location.href = `/api/interventi/export?${params.toString()}`;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="primary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Esporta gli interventi del periodo in Excel (rispetta i filtri attivi)"
      >
        Esporta Excel
      </Button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-[var(--radius-lg)] border p-3"
          style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', boxShadow: 'var(--shadow-md)' }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Dal</span>
            <DatePicker value={from} onChange={setFrom} max={to} ariaLabel="Data inizio" fullWidth />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Al</span>
            <DatePicker value={to} onChange={setTo} min={from} max={maxData} ariaLabel="Data fine" fullWidth />
          </div>
          <Button variant="primary" onClick={scarica}>Scarica</Button>
        </div>
      )}
    </div>
  );
}
