'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerUpRight } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';
import { AZIONE_ICONA, AZIONE_TESTO, nomeComando } from './stili';

export default function MenuSposta({
  modo, territori, territorioCorrente, onSpostaTerritorio, onSpostaData, busy, label,
  ariaLabel = 'Sposta in un altro territorio o giorno',
}: {
  modo: 'operatore' | 'piano';
  territori: Array<{ id: string; name: string }>;
  territorioCorrente: string | null;
  onSpostaTerritorio: (territorio: string | null) => void;
  onSpostaData: (dataIso: string) => void;
  busy: boolean;
  /** Se assente il comando è a sola icona; se presente è testuale. */
  label?: string;
  ariaLabel?: string;
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
        aria-expanded={open}
        {...(label ? { title: ariaLabel } : nomeComando(ariaLabel))}
        className={label ? AZIONE_TESTO : AZIONE_ICONA}
      >
        <CornerUpRight size={13} aria-hidden />
        {label}
        {label && <ChevronDown size={12} aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-60 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2.5 shadow-[var(--shadow-lg)]">
          <div className="mb-1 text-xs font-semibold text-[var(--brand-text-muted)]">In un altro territorio</div>
          <select
            defaultValue=""
            disabled={busy}
            aria-label="Sposta in un altro territorio"
            onChange={(e) => { const v = e.target.value; if (v === '') return; onSpostaTerritorio(v === '__reset__' ? null : v); setOpen(false); }}
            className="mb-2.5 w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-xs text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border-strong)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          >
            <option value="" disabled>Scegli territorio…</option>
            {modo === 'operatore' && territorioCorrente && <option value="__reset__">Riporta al piano</option>}
            {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div className="mb-1 text-xs font-semibold text-[var(--brand-text-muted)]">In un altro giorno</div>
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
