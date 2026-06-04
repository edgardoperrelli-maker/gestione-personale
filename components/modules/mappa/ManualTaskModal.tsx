'use client';

import { useState } from 'react';

export type ManualTaskData = {
  indirizzo: string;
  cap: string;
  citta: string;
  odl: string;
  pdr: string;
  attivita: string;
  fascia_oraria: string;
  nominativo: string;
  staffId: string;
};

export default function ManualTaskModal({
  operators,
  onClose,
  onAdd,
}: {
  operators: { id: string; displayName: string }[];
  onClose: () => void;
  onAdd: (data: ManualTaskData) => Promise<void> | void;
}) {
  const [d, setD] = useState<ManualTaskData>({
    indirizzo: '', cap: '', citta: '', odl: '', pdr: '', attivita: '', fascia_oraria: '', nominativo: '', staffId: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ManualTaskData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }));

  const valido = d.indirizzo.trim() !== '' && d.citta.trim() !== '';
  const inputCls = 'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

  const handleAdd = async () => {
    if (!valido || saving) return;
    setSaving(true);
    try {
      await onAdd(d);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-3">
          <h3 className="text-base font-semibold text-[var(--brand-text-main)]">Aggiungi intervento manuale</h3>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">✕</button>
        </div>
        <div className="grid flex-1 gap-3 overflow-auto p-5 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Indirizzo *</span><input className={inputCls} value={d.indirizzo} onChange={set('indirizzo')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">CAP</span><input className={inputCls} value={d.cap} onChange={set('cap')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Comune *</span><input className={inputCls} value={d.citta} onChange={set('citta')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">ODSIN</span><input className={inputCls} value={d.odl} onChange={set('odl')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">PDR</span><input className={inputCls} value={d.pdr} onChange={set('pdr')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Attività</span><input className={inputCls} value={d.attivita} onChange={set('attivita')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Fascia oraria</span><input className={inputCls} value={d.fascia_oraria} onChange={set('fascia_oraria')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nominativo</span><input className={inputCls} value={d.nominativo} onChange={set('nominativo')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Esecutore</span>
            <select className={inputCls} value={d.staffId} onChange={set('staffId')}>
              <option value="">— nessuno / auto —</option>
              {operators.map((o) => (<option key={o.id} value={o.id}>{o.displayName}</option>))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">Annulla</button>
          <button onClick={handleAdd} disabled={!valido || saving} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] hover:opacity-90 disabled:opacity-50">
            {saving ? 'Aggiungo…' : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  );
}
