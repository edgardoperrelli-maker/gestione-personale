'use client';
import { useEffect, useRef, useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';

export default function MenuSposta({
  modo, territori, territorioCorrente, onSpostaTerritorio, onSpostaData, busy, label = '↪',
}: {
  modo: 'operatore' | 'piano';
  territori: Array<{ id: string; name: string }>;
  territorioCorrente: string | null;
  onSpostaTerritorio: (territorio: string | null) => void;
  onSpostaData: (dataIso: string) => void;
  busy: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title="Sposta in un altro territorio o giorno"
        className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)] hover:text-[var(--brand-primary)] disabled:opacity-50"
      >{label}</button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-56 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 text-[12px]" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">In un altro territorio</div>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => { const v = e.target.value; if (v === '') return; onSpostaTerritorio(v === '__reset__' ? null : v); setOpen(false); }}
            className="mb-2 w-full rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1.5 py-1 text-[12px]"
          >
            <option value="" disabled>Scegli territorio…</option>
            {modo === 'operatore' && territorioCorrente && <option value="__reset__">↩ Riporta al piano</option>}
            {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">In un altro giorno</div>
          <DatePicker
            value=""
            onChange={(iso) => { onSpostaData(iso); setOpen(false); }}
            disabled={busy}
            ariaLabel="Sposta a giorno"
            fullWidth
            triggerClassName="border border-[var(--brand-border)] bg-[var(--brand-surface)]"
          />
        </div>
      )}
    </div>
  );
}
