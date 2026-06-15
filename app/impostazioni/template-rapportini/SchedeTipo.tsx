'use client';
import type { SchedaTemplate } from '@/lib/rapportini/templateScheda';

const SCHEDE: { key: SchedaTemplate; label: string }[] = [
  { key: 'classici', label: 'Classici · pianificati' },
  { key: 'manuali', label: 'Interventi manuali' },
];

type Props = {
  attiva: SchedaTemplate;
  onChange: (s: SchedaTemplate) => void;
};

export default function SchedeTipo({ attiva, onChange }: Props) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-1">
      {SCHEDE.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          aria-pressed={attiva === s.key}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            attiva === s.key
              ? 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]'
              : 'text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
