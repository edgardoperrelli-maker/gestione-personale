// components/modules/interventi/StoricoInterventiClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StoricoFiltri, { type StatoFiltriUI } from './StoricoFiltri';
import StoricoTabella from './StoricoTabella';
import type { RigaStorico, ContatoriStorico } from '@/lib/interventi/storico/types';

type Staff = { id: string; display_name: string };

const FILTRI_VUOTI: StatoFiltriUI = {
  q: '', dal: '', al: '', esecutore: '', comune: '',
  eseguito: '', sostValvola: '', miniBag: '', rgStop: '',
};

const CONTATORI_ZERO: ContatoriStorico = {
  totale: 0, esitati: 0, eseguiti: 0, negativi: 0, sostValvola: 0, miniBag: 0, rgStop: 0,
};

const CARDS: { key: keyof ContatoriStorico; label: string; tone?: 'ok' | 'no' }[] = [
  { key: 'esitati', label: 'Interventi esitati' },
  { key: 'eseguiti', label: 'Eseguiti', tone: 'ok' },
  { key: 'negativi', label: 'Negativi', tone: 'no' },
  { key: 'sostValvola', label: 'Sost. valvola' },
  { key: 'miniBag', label: 'Mini bag' },
  { key: 'rgStop', label: 'RG stop' },
];

/** Querystring dei filtri (senza `page`), condivisa da lista ed export. */
function filtriToParams(f: StatoFiltriUI): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) {
    params.set('q', f.q.trim());
  } else {
    if (f.dal) params.set('dal', f.dal);
    if (f.al) params.set('al', f.al);
  }
  if (f.esecutore) params.set('esecutore', f.esecutore);
  if (f.comune.trim()) params.set('comune', f.comune.trim());
  if (f.eseguito) params.set('eseguito', f.eseguito);
  if (f.sostValvola) params.set('sostValvola', f.sostValvola);
  if (f.miniBag) params.set('miniBag', f.miniBag);
  if (f.rgStop) params.set('rgStop', f.rgStop);
  return params;
}

export default function StoricoInterventiClient({ staff }: { staff: Staff[] }) {
  const [filtri, setFiltri] = useState<StatoFiltriUI>(FILTRI_VUOTI);
  const [righe, setRighe] = useState<RigaStorico[]>([]);
  const [total, setTotal] = useState(0);
  const [troncato, setTroncato] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [contatori, setContatori] = useState<ContatoriStorico>(CONTATORI_ZERO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const carica = useCallback(async (f: StatoFiltriUI, p: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = filtriToParams(f);
      params.set('page', String(p));

      const res = await fetch(`/api/interventi/storico?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore caricamento.');
      }
      const data = (await res.json()) as {
        righe: RigaStorico[]; total: number; troncato: boolean; pageSize: number; contatori?: ContatoriStorico;
      };
      setRighe(Array.isArray(data.righe) ? data.righe : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTroncato(Boolean(data.troncato));
      setPageSize(typeof data.pageSize === 'number' ? data.pageSize : 100);
      setContatori(data.contatori ?? CONTATORI_ZERO);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // richiesta annullata: ignora
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
      setRighe([]);
      setTotal(0);
      setTroncato(false);
      setContatori(CONTATORI_ZERO);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  // Caricamento iniziale: nessun filtro → intero DB (paginato).
  useEffect(() => {
    void carica(FILTRI_VUOTI, 0);
  }, [carica]);

  // Debounce sulla ricerca testuale (parte da sola).
  const primaVolta = useRef(true);
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false;
      return;
    }
    const t = setTimeout(() => {
      setPage(0);
      void carica(filtri, 0);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtri.q]);

  const applica = () => { setPage(0); void carica(filtri, 0); };
  const pulisci = () => { setFiltri(FILTRI_VUOTI); setPage(0); void carica(FILTRI_VUOTI, 0); };
  const vaiPagina = (p: number) => { setPage(p); void carica(filtri, p); };
  const esporta = () => {
    window.location.href = `/api/interventi/storico/export?${filtriToParams(filtri).toString()}`;
  };

  const totPagine = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2">
            <div className="text-xs text-[var(--brand-text-muted)]">{c.label}</div>
            <div
              className={`text-2xl font-semibold ${
                c.tone === 'ok' ? 'text-[var(--success)]' : c.tone === 'no' ? 'text-[var(--danger)]' : 'text-[var(--brand-primary)]'
              }`}
            >
              {contatori[c.key].toLocaleString('it-IT')}
            </div>
          </div>
        ))}
      </div>

      <StoricoFiltri
        filtri={filtri}
        setFiltri={setFiltri}
        staff={staff}
        onApplica={applica}
        onPulisci={pulisci}
        onEsporta={esporta}
        loading={loading}
      />

      {troncato && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning)]">
          Troppi risultati: i contatori e la tabella mostrano i primi {total}. Restringi i filtri.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 rounded-2xl bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento…
          </div>
        )}
        <StoricoTabella righe={righe} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--brand-text-muted)]">
        <span>{total.toLocaleString('it-IT')} righe</span>
        {totPagine > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Pagina precedente"
              onClick={() => vaiPagina(Math.max(0, page - 1))}
              disabled={loading || page === 0}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50"
            >
              ←
            </button>
            <span>Pagina {page + 1} di {totPagine}</span>
            <button
              type="button"
              aria-label="Pagina successiva"
              onClick={() => vaiPagina(Math.min(totPagine - 1, page + 1))}
              disabled={loading || page >= totPagine - 1}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
