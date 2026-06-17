// components/modules/interventi/StoricoFiltri.tsx
'use client';

import DatePicker from '@/components/ui/DatePicker';

export type StatoFiltriUI = {
  q: string;
  dal: string;
  al: string;
  esecutore: string;
  comune: string;
  eseguito: string;
  sostValvola: string;
  miniBag: string;
  rgStop: string;
};

type Staff = { id: string; display_name: string };

const sel =
  'rounded-lg border border-[var(--brand-border-strong)] bg-[var(--brand-bg)] px-3 py-2 text-sm text-[var(--brand-text-main)]';
const dateTrigger = 'border border-[var(--brand-border-strong)] bg-[var(--brand-bg)]';

const SI_NO = [
  { key: 'eseguito', label: 'Eseguito' },
  { key: 'sostValvola', label: 'Sost. valvola' },
  { key: 'miniBag', label: 'Mini bag' },
  { key: 'rgStop', label: 'RG stop' },
] as const;

export default function StoricoFiltri({
  filtri, setFiltri, staff, onApplica, onPulisci, loading,
}: {
  filtri: StatoFiltriUI;
  setFiltri: (f: StatoFiltriUI) => void;
  staff: Staff[];
  onApplica: () => void;
  onPulisci: () => void;
  loading: boolean;
}) {
  const set = (patch: Partial<StatoFiltriUI>) => setFiltri({ ...filtri, ...patch });

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <div>
        <label
          htmlFor="storico-ricerca"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--brand-text-muted)]"
        >
          Cerca nel database
        </label>
        <input
          id="storico-ricerca"
          type="search"
          className={`${sel} w-full`}
          placeholder="🔍 ODL / via / matricola / PDR / nominativo… (cerca su tutto lo storico)"
          value={filtri.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Ricerca interventi"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DatePicker value={filtri.dal} onChange={(iso) => set({ dal: iso })} placeholder="Dal" ariaLabel="Dal" fullWidth triggerClassName={dateTrigger} />
        <DatePicker value={filtri.al} onChange={(iso) => set({ al: iso })} placeholder="Al" ariaLabel="Al" fullWidth triggerClassName={dateTrigger} />

        <select className={sel} value={filtri.esecutore} onChange={(e) => set({ esecutore: e.target.value })} aria-label="Esecutore">
          <option value="">Esecutore: tutti</option>
          {staff.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
        </select>

        <input className={sel} placeholder="Comune" value={filtri.comune} onChange={(e) => set({ comune: e.target.value })} aria-label="Comune" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SI_NO.map((c) => (
          <select
            key={c.key}
            className={sel}
            value={filtri[c.key]}
            onChange={(e) => set({ [c.key]: e.target.value } as Partial<StatoFiltriUI>)}
            aria-label={c.label}
          >
            <option value="">{c.label}: tutti</option>
            <option value="SI">{c.label}: SI</option>
            <option value="NO">{c.label}: NO</option>
          </select>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApplica}
          disabled={loading}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Applica filtri
        </button>
        <button
          type="button"
          onClick={onPulisci}
          disabled={loading}
          className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-main)] disabled:opacity-60"
        >
          Pulisci
        </button>
      </div>
    </div>
  );
}
