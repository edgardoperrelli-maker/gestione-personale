'use client';
import type { FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';

const STATI: Array<{ k: 'valido' | 'scaduto' | 'inviato'; label: string }> = [
  { k: 'inviato', label: 'Inviato' },
  { k: 'valido', label: 'In corso' },
  { k: 'scaduto', label: 'Scaduto' },
];

export default function FiltriRiepilogo({
  filtri, setFiltri, territori, operatori,
}: {
  filtri: Filtri;
  setFiltri: (f: Filtri) => void;
  territori: string[];
  operatori: { id: string; nome: string }[];
}) {
  const toggleStato = (k: 'valido' | 'scaduto' | 'inviato') => {
    setFiltri({
      ...filtri,
      stati: filtri.stati.includes(k) ? filtri.stati.filter((s) => s !== k) : [...filtri.stati, k],
    });
  };
  const sel = 'rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={filtri.territorio} onChange={(e) => setFiltri({ ...filtri, territorio: e.target.value })}>
        <option value="">Territorio: tutti</option>
        {territori.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className={sel} value={filtri.operatore} onChange={(e) => setFiltri({ ...filtri, operatore: e.target.value })}>
        <option value="">Operatore: tutti</option>
        {operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
      {STATI.map((s) => (
        <button
          key={s.k}
          type="button"
          onClick={() => toggleStato(s.k)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            filtri.stati.includes(s.k)
              ? 'border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
              : 'border border-[var(--brand-border)] text-[var(--brand-text-muted)]'
          }`}
        >
          {s.label}
        </button>
      ))}
      <input
        className={`${sel} flex-1 min-w-[140px]`}
        placeholder="cerca operatore / territorio…"
        value={filtri.q}
        onChange={(e) => setFiltri({ ...filtri, q: e.target.value })}
      />
    </div>
  );
}
