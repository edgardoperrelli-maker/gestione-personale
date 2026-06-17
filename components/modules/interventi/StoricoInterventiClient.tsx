// components/modules/interventi/StoricoInterventiClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import StoricoFiltri, { type StatoFiltriUI } from './StoricoFiltri';
import StoricoTabella from './StoricoTabella';
import type { RigaStorico } from '@/lib/interventi/storico/types';

type Staff = { id: string; display_name: string };

const FILTRI_VUOTI: StatoFiltriUI = {
  q: '', dal: '', al: '', esecutore: '', comune: '', committente: '', stato: '', esito: '',
};

export default function StoricoInterventiClient({ staff }: { staff: Staff[] }) {
  const [filtri, setFiltri] = useState<StatoFiltriUI>(FILTRI_VUOTI);
  const [righe, setRighe] = useState<RigaStorico[]>([]);
  const [total, setTotal] = useState(0);
  const [troncato, setTroncato] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
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
      const params = new URLSearchParams();
      if (f.q.trim()) {
        params.set('q', f.q.trim());
      } else {
        if (f.dal) params.set('dal', f.dal);
        if (f.al) params.set('al', f.al);
      }
      if (f.esecutore) params.set('esecutore', f.esecutore);
      if (f.comune.trim()) params.set('comune', f.comune.trim());
      if (f.committente) params.set('committente', f.committente);
      if (f.stato) params.set('stato', f.stato);
      if (f.esito) params.set('esito', f.esito);
      params.set('page', String(p));

      const res = await fetch(`/api/interventi/storico?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore caricamento.');
      }
      const data = (await res.json()) as { righe: RigaStorico[]; total: number; troncato: boolean; pageSize: number };
      setRighe(Array.isArray(data.righe) ? data.righe : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTroncato(Boolean(data.troncato));
      setPageSize(typeof data.pageSize === 'number' ? data.pageSize : 100);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // richiesta annullata: ignora
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
      setRighe([]);
      setTotal(0);
      setTroncato(false);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  // Caricamento iniziale: giorno corrente (filtri vuoti → default oggi lato server).
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

  const totPagine = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <StoricoFiltri
        filtri={filtri}
        setFiltri={setFiltri}
        staff={staff}
        onApplica={applica}
        onPulisci={pulisci}
        loading={loading}
      />

      {troncato && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning)]">
          Troppi risultati: vengono mostrati i primi {total}. Restringi i filtri per vedere tutto.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="relative min-h-[120px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-2xl bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento…
          </div>
        )}
        <StoricoTabella righe={righe} />
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--brand-text-muted)]">
        <span>{total} interventi</span>
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
