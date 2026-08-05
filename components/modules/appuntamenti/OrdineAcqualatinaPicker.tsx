'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import Input from '@/components/Input';

/*
  Per AcquaLatina l'appuntamento nasce SEMPRE da una riga del registro, non da un PDR digitato a
  mano: questo componente cerca fra gli ordini ancora da fissare (aperti, senza esito positivo, non
  già agganciati a un altro appuntamento — vedi app/api/appointments/ordini-acqualatina) e, una
  volta scelto, mostra un riepilogo al posto della barra di ricerca finché non si preme «Cambia».
*/

export type OrdineAcqualatina = {
  id: string;
  odl: string;
  numero_operazione: string;
  impianto: string | null;
  matricola: string | null;
  nominativo: string | null;
  recapito: string | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  stato_desc: string | null;
  causale_desc: string | null;
  testo_ordine: string | null;
};

type Props = {
  value: OrdineAcqualatina | null;
  onChange: (ordine: OrdineAcqualatina | null) => void;
  error?: boolean;
};

const indirizzoOrdine = (o: OrdineAcqualatina) =>
  [[o.via, o.civico].filter(Boolean).join(' '), o.cap, o.comune].filter(Boolean).join(', ');

export default function OrdineAcqualatinaPicker({ value, onChange, error = false }: Props) {
  const [query, setQuery] = useState('');
  const [risultati, setRisultati] = useState<OrdineAcqualatina[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const richiesta = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRisultati([]); setLoading(false); return; }
    setLoading(true);
    const mia = ++richiesta.current;
    const t = setTimeout(() => {
      fetch(`/api/appointments/ordini-acqualatina?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json: { righe?: OrdineAcqualatina[] }) => {
          if (mia === richiesta.current) setRisultati(json.righe ?? []);
        })
        .catch(() => { if (mia === richiesta.current) setRisultati([]); })
        .finally(() => { if (mia === richiesta.current) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const scegli = (o: OrdineAcqualatina) => {
    onChange(o);
    setQuery('');
    setRisultati([]);
    setOpen(false);
  };

  if (value) {
    return (
      <div
        className={`flex items-start justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2 ${
          error ? 'border-[var(--danger)]' : 'border-[var(--brand-border)]'
        } bg-[var(--brand-surface-muted)]`}
      >
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-[var(--brand-text-main)]">
            ODL {value.odl}{value.impianto ? ` · ${value.impianto}` : ''}
          </div>
          <div className="truncate text-xs text-[var(--brand-text-muted)]">
            {[value.nominativo, indirizzoOrdine(value)].filter(Boolean).join(' — ') || 'Nessun dettaglio disponibile'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 rounded-[var(--radius-md)] p-1 text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-text-main)]"
          aria-label="Cambia ordine"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-text-subtle)]" aria-hidden />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Cerca ODL, matricola, impianto, nominativo, indirizzo…"
          className="pl-8"
          error={error}
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div
          className="absolute left-0 top-full z-[60] mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] py-1"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--brand-text-muted)]">
              <Loader2 size={13} className="animate-spin" aria-hidden /> Ricerca…
            </div>
          )}
          {!loading && risultati.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--brand-text-muted)]">Nessun ordine trovato</div>
          )}
          {!loading && risultati.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => scegli(o)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--brand-surface-muted)]"
            >
              <div className="font-semibold text-[var(--brand-text-main)]">
                ODL {o.odl}{o.impianto ? ` · ${o.impianto}` : ''}
              </div>
              <div className="truncate text-xs text-[var(--brand-text-muted)]">
                {[o.nominativo, indirizzoOrdine(o)].filter(Boolean).join(' — ') || '—'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
