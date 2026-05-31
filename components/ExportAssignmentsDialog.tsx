'use client';
import { useEffect, useState } from 'react';

export default function ExportAssignmentsDialog({
  open, onClose, defaultFrom, defaultTo,
}:{
  open: boolean;
  onClose: () => void;
  defaultFrom: string; // DD-MM-YYYY
  defaultTo: string;   // DD-MM-YYYY
}) {
  const [fromIso, setFromIso] = useState(defaultFrom);
  const [toIso, setToIso] = useState(defaultTo);

  useEffect(() => {
    if (open) {
      setFromIso(defaultFrom);
      setToIso(defaultTo);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, defaultFrom, defaultTo]);

  if (!open) return null;

  const canExport = /^\d{4}-\d{2}-\d{2}$/.test(fromIso) && /^\d{4}-\d{2}-\d{2}$/.test(toIso);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[oklch(0_0_0/0.6)]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl">
        <div className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between">
          <div className="text-sm text-[var(--brand-text-muted)]">Esporta assegnazioni</div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Dal</span>
              <input
                type="date"
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={fromIso}
                onChange={e=>setFromIso(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Al</span>
              <input
                type="date"
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={toIso}
                onChange={e=>setToIso(e.target.value)}
              />
            </label>
          </div>

          <div className="px-0 pt-3 border-t border-[var(--brand-border)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!canExport}
              onClick={() => {
                const a = fromIso <= toIso ? fromIso : toIso;
                const b = toIso >= fromIso ? toIso : fromIso;
                window.location.href = `/api/export/assignments?from=${a}&to=${b}`;
                onClose();
              }}
              className={`px-4 py-1.5 rounded-lg text-[oklch(0.16_0.06_245)] ${canExport ? 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)]' : 'bg-[var(--brand-text-subtle)] cursor-not-allowed'}`}
            >
              Esporta CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
