'use client';

import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none disabled:opacity-70';

export function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
}) {
  if (campo.tipo === 'crocetta') {
    const checked = valore === true;
    return (
      <label
        className={`flex min-h-[50px] items-center gap-3 rounded-xl border p-3 transition ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
            : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]'
        } ${disabilitato ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
        />
        <span className="text-sm font-semibold">{campo.etichetta}</span>
      </label>
    );
  }

  const labelEl = (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
      {campo.etichetta}
    </label>
  );

  if (campo.tipo === 'select') {
    return (
      <div>
        {labelEl}
        <select value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— Seleziona —</option>
          {(campo.opzioni ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (campo.tipo === 'numero') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          inputMode="decimal"
          value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
      </div>
    );
  }

  if (campo.tipo === 'foto') {
    return (
      <div>
        {labelEl}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-muted)]">
          <span aria-hidden>📷</span>
          <span>Slot foto{campo.obbligatoria ? ' (obbligatoria)' : ''}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <textarea rows={2} value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} />
    </div>
  );
}
