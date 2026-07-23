'use client';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
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
  return (
    <>
      {/* I primitivi Select/Input sono `w-full`: la larghezza si governa dal
          contenitore, non sovrascrivendo la classe (l'ordine fra due utility
          della stessa proprietà non è garantito). */}
      <div className="min-w-[150px] flex-1 sm:max-w-[200px]">
        <Select
          aria-label="Filtra per territorio"
          className="py-1.5 text-xs"
          value={filtri.territorio}
          onChange={(e) => setFiltri({ ...filtri, territorio: e.target.value })}
        >
          <option value="">Territorio: tutti</option>
          {territori.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      <div className="min-w-[150px] flex-1 sm:max-w-[200px]">
        <Select
          aria-label="Filtra per operatore"
          className="py-1.5 text-xs"
          value={filtri.operatore}
          onChange={(e) => setFiltri({ ...filtri, operatore: e.target.value })}
        >
          <option value="">Operatore: tutti</option>
          {/* value = staff_id: è la chiave su cui filtra `filtraRapportini`. */}
          {operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Select>
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label="Filtra per stato">
        {STATI.map((s) => {
          const attivo = filtri.stati.includes(s.k);
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => toggleStato(s.k)}
              aria-pressed={attivo}
              // `whitespace-nowrap`: a 320px «In corso» andava a capo dentro la
              // pillola, e il testo cliccabile su due righe è fuori regola.
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                attivo
                  ? 'border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
                  : 'border-[var(--brand-border)] text-[var(--brand-text-muted)] hover:border-[var(--brand-border-strong)] hover:text-[var(--brand-text-main)]'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="min-w-[160px] flex-1 sm:max-w-[240px]">
        <Input
          aria-label="Cerca operatore o territorio"
          className="py-1.5 text-xs"
          placeholder="cerca operatore / territorio…"
          value={filtri.q}
          onChange={(e) => setFiltri({ ...filtri, q: e.target.value })}
        />
      </div>
    </>
  );
}
