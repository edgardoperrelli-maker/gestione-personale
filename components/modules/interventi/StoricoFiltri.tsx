// components/modules/interventi/StoricoFiltri.tsx
'use client';

import { useState } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import MultiSelect from '@/components/ui/MultiSelect';
import { FilterPill, AddFilterButton } from '@/components/ui/FilterBar';

export type StatoFiltriUI = {
  q: string;
  dal: string;
  al: string;
  esecutori: string[];
  comune: string;
  gruppi: string[];
  committenti: string[];
  territori: string[];
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

const COMMITTENTI = [
  { value: 'acea', label: 'Acea' },
  { value: 'italgas', label: 'Italgas' },
  { value: 'altro', label: 'Altro' },
];

const fmtGiorno = (iso: string) => iso.split('-').reverse().join('/');

/** Range rapidi (innesto SupplyHub): Oggi / Questa settimana / Questo mese, fuso Europe/Rome. */
function rangeRapidi(): { label: string; dal: string; al: string }[] {
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const [y, m, d] = oggi.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const dow = (base.getUTCDay() + 6) % 7; // lunedì = 0
  const lunedi = new Date(base);
  lunedi.setUTCDate(base.getUTCDate() - dow);
  return [
    { label: 'Oggi', dal: oggi, al: oggi },
    { label: 'Settimana', dal: iso(lunedi), al: oggi },
    { label: 'Mese', dal: `${oggi.slice(0, 8)}01`, al: oggi },
  ];
}
/** Etichetta compatta per le pill multi-valore: primo valore + eventuale «+N». */
const compatta = (labels: string[]) =>
  labels.length <= 1 ? labels[0] ?? '' : `${labels[0]} +${labels.length - 1}`;

export default function StoricoFiltri({
  filtri, setFiltri, staff, gruppi, territori, onApplica, onPulisci, onEsporta, onPatch, loading,
}: {
  filtri: StatoFiltriUI;
  setFiltri: (f: StatoFiltriUI) => void;
  staff: Staff[];
  /** Gruppi attività della tassonomia (opzioni del filtro multi). */
  gruppi: string[];
  /** Nomi dei territori/contratti (opzioni del filtro multi). */
  territori: string[];
  onApplica: () => void;
  onPulisci: () => void;
  onEsporta: () => void;
  /** Applica un patch e ricarica subito (rimozione pill, sistema Cockpit). */
  onPatch: (patch: Partial<StatoFiltriUI>) => void;
  loading: boolean;
}) {
  const set = (patch: Partial<StatoFiltriUI>) => setFiltri({ ...filtri, ...patch });
  const [aperto, setAperto] = useState(false);

  // Pill dei filtri strutturati attivi (la ricerca testuale resta nel campo).
  const pills: { label: string; patch: Partial<StatoFiltriUI> }[] = [];
  if (filtri.dal || filtri.al) {
    pills.push({
      label: `Periodo: ${filtri.dal ? fmtGiorno(filtri.dal) : '…'} → ${filtri.al ? fmtGiorno(filtri.al) : '…'}`,
      patch: { dal: '', al: '' },
    });
  }
  if (filtri.esecutori.length) {
    const nomi = filtri.esecutori.map((id) => staff.find((s) => s.id === id)?.display_name ?? id);
    pills.push({ label: `Esecutore: ${compatta(nomi)}`, patch: { esecutori: [] } });
  }
  if (filtri.comune.trim()) pills.push({ label: `Comune: ${filtri.comune.trim()}`, patch: { comune: '' } });
  if (filtri.gruppi.length) pills.push({ label: `Gruppo: ${compatta(filtri.gruppi)}`, patch: { gruppi: [] } });
  if (filtri.committenti.length) {
    const nomi = filtri.committenti.map((v) => COMMITTENTI.find((c) => c.value === v)?.label ?? v);
    pills.push({ label: `Committente: ${compatta(nomi)}`, patch: { committenti: [] } });
  }
  if (filtri.territori.length) pills.push({ label: `Territorio: ${compatta(filtri.territori)}`, patch: { territori: [] } });
  for (const c of SI_NO) {
    if (filtri[c.key]) pills.push({ label: `${c.label}: ${filtri[c.key]}`, patch: { [c.key]: '' } as Partial<StatoFiltriUI> });
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-[var(--shadow-sm)]">
      {/* Barra cockpit: ricerca + pill attive + apertura pannello */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="storico-ricerca"
          type="search"
          className={`${sel} min-w-[220px] flex-1`}
          placeholder="ODL / via / matricola / sigillo / PDR / nominativo…"
          value={filtri.q}
          onChange={(e) => set({ q: e.target.value })}
          aria-label="Ricerca interventi"
        />
        <div className="flex gap-1.5" role="group" aria-label="Range rapidi">
          {rangeRapidi().map((r) => {
            const attivo = filtri.dal === r.dal && filtri.al === r.al;
            return (
              <button
                key={r.label}
                type="button"
                aria-pressed={attivo}
                onClick={() => onPatch(attivo ? { dal: '', al: '' } : { dal: r.dal, al: r.al })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                  attivo
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
                    : 'border-[var(--brand-border-strong)] text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)]'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {pills.map((p) => (
          <FilterPill key={p.label} onRemove={() => onPatch(p.patch)} removeLabel={`Rimuovi filtro ${p.label}`}>
            {p.label}
          </FilterPill>
        ))}
        <AddFilterButton onClick={() => setAperto((v) => !v)} aria-expanded={aperto}>
          {aperto ? 'Chiudi filtri' : '+ Filtro'}
        </AddFilterButton>
        <button
          type="button"
          onClick={onEsporta}
          disabled={loading}
          className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
        >
          Esporta Excel
        </button>
      </div>

      {aperto && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DatePicker value={filtri.dal} onChange={(iso) => set({ dal: iso })} placeholder="Dal" ariaLabel="Dal" fullWidth triggerClassName={dateTrigger} />
            <DatePicker value={filtri.al} onChange={(iso) => set({ al: iso })} placeholder="Al" ariaLabel="Al" fullWidth triggerClassName={dateTrigger} />

            <MultiSelect
              label="Esecutore"
              ariaLabel="Esecutore"
              options={staff.map((s) => ({ value: s.id, label: s.display_name }))}
              values={filtri.esecutori}
              onChange={(esecutori) => set({ esecutori })}
            />

            <input className={sel} placeholder="Comune" value={filtri.comune} onChange={(e) => set({ comune: e.target.value })} aria-label="Comune" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MultiSelect
              label="Gruppo attività"
              ariaLabel="Gruppo attività"
              options={gruppi.map((g) => ({ value: g, label: g }))}
              values={filtri.gruppi}
              onChange={(gruppi) => set({ gruppi })}
            />
            <MultiSelect
              label="Committente"
              ariaLabel="Committente"
              options={COMMITTENTI}
              values={filtri.committenti}
              onChange={(committenti) => set({ committenti })}
            />
            <MultiSelect
              label="Territorio"
              ariaLabel="Territorio"
              options={territori.map((t) => ({ value: t, label: t }))}
              values={filtri.territori}
              onChange={(territori) => set({ territori })}
            />
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApplica}
              disabled={loading}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              Cerca
            </button>
            <button
              type="button"
              onClick={onPulisci}
              disabled={loading}
              className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-main)] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              Pulisci
            </button>
          </div>
        </>
      )}
    </div>
  );
}
