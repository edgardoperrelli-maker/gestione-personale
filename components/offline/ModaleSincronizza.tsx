'use client';

import { useEffect, useRef, useState } from 'react';
import { dbOutbox } from '@/lib/offline/db';
import { sincronizzaToken } from '@/lib/offline/sync';
import { ripristinaApp } from '@/lib/offline/ripristino';
import type { OutboxItem } from '@/lib/offline/types';

const ETICHETTA: Record<OutboxItem['type'], string> = {
  voce: 'Interventi compilati',
  foto: 'Foto',
  agenda: 'Esiti intervento',
  manuale: 'Richieste manuali',
  invia: 'Invio rapportino',
};

const ORDINE: OutboxItem['type'][] = ['voce', 'foto', 'manuale', 'agenda', 'invia'];

/**
 * Modale di sincronizzazione: NON sincronizza in silenzio — mostra COSA sta inviando
 * (la coda offline raggruppata per tipo) e l'avanzamento live finché la coda si svuota.
 * All'apertura, se online, avvia il drenaggio della coda e fa poll per aggiornare i conteggi.
 * Il pulsante "Aggiorna pagina" ricarica per riallineare la vista al server.
 */
export function ModaleSincronizza({ token, onChiudi }: { token: string; onChiudi: () => void }) {
  const [items, setItems] = useState<OutboxItem[] | null>(null);
  const [online] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [sincronizzando, setSincronizzando] = useState(false);
  const attivoRef = useRef(true);

  useEffect(() => {
    attivoRef.current = true;

    const carica = async (): Promise<OutboxItem[]> => {
      try {
        const its = await dbOutbox.perToken(token);
        if (attivoRef.current) setItems(its);
        return its;
      } catch {
        return [];
      }
    };

    void (async () => {
      const iniziali = await carica();
      if (!online) return;
      if (iniziali.filter((i) => i.stato !== 'bloccato').length === 0) return; // niente da inviare
      setSincronizzando(true);
      void sincronizzaToken(token); // drena la coda (in parallelo al poll)
      let stalli = 0;
      let restantiPrec = Infinity;
      for (let i = 0; i < 40 && attivoRef.current; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const its = await carica();
        const restanti = its.filter((x) => x.stato !== 'bloccato').length;
        if (restanti === 0) break;
        if (restanti < restantiPrec) { restantiPrec = restanti; stalli = 0; }
        else if (++stalli >= 5) { void sincronizzaToken(token); stalli = 0; } // re-innesca se fermo
      }
      if (attivoRef.current) setSincronizzando(false);
    })();

    return () => { attivoRef.current = false; };
  }, [token, online]);

  const lista = items ?? [];
  const attivi = lista.filter((i) => i.stato !== 'bloccato');
  const bloccati = lista.filter((i) => i.stato === 'bloccato');
  const conteggi = ORDINE.map((t) => ({ t, n: attivi.filter((i) => i.type === t).length })).filter((x) => x.n > 0);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--brand-text-main)]">Sincronizzazione</h2>
          <button type="button" onClick={onChiudi} className="text-sm font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>

        {!online && (
          <p className="mb-3 rounded-xl border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] p-3 text-sm font-medium text-[var(--warning-fg,#92400e)]">
            Sei offline. I dati sono salvati sul telefono e partiranno appena torni online.
          </p>
        )}

        {items === null ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Carico…</p>
        ) : (
          <div className="space-y-2">
            {conteggi.length > 0 && (
              <ul className="space-y-2">
                {conteggi.map(({ t, n }) => (
                  <li key={t} className="flex items-center justify-between rounded-xl bg-[var(--brand-surface-muted)] px-3 py-2.5 text-sm">
                    <span className="font-semibold text-[var(--brand-text-main)]">{ETICHETTA[t]}</span>
                    <span className="inline-flex items-center gap-2 font-semibold text-[var(--brand-text-muted)]">
                      {n}
                      {sincronizzando && online && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" aria-hidden />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {conteggi.length === 0 && bloccati.length === 0 && (
              <p className="rounded-xl bg-[var(--success-soft)] px-3 py-3 text-sm font-semibold text-[var(--success)]">✓ Tutto sincronizzato</p>
            )}

            {!sincronizzando && online && conteggi.length > 0 && (
              <p className="text-xs text-[var(--brand-text-muted)]">
                Alcuni elementi non sono ancora partiti: riprova tra poco o controlla la connessione.
              </p>
            )}

            {bloccati.length > 0 && (
              <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
                <p className="mb-1 text-sm font-bold text-[var(--danger)]">{bloccati.length} da risolvere</p>
                <ul className="space-y-1">
                  {bloccati.map((it) => (
                    <li key={it.id} className="text-xs text-[var(--danger)]">
                      {ETICHETTA[it.type]} — {it.ultimoErrore ?? 'Non sincronizzabile'}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-[var(--danger)]">Per i casi recuperabili contatta l&apos;ufficio.</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onChiudi} className="flex-1 rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
            disabled={sincronizzando && online}
            className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[var(--on-primary)] disabled:opacity-50"
          >
            Aggiorna pagina
          </button>
        </div>

        {/*
          Ultima spiaggia, sempre disponibile: se l'app resta "impantanata" (invii che non partono
          mai, badge fermo) nonostante l'aggiornamento, questo azzera cache + service worker + gli
          elementi bloccati e ricarica — come aprire in navigazione anonima, ma con un tocco. NON
          tocca gli interventi validi ancora in coda. Funziona su Android e iOS (API standard).
        */}
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm('Svuota la cache dell’app e ricarica. Utile se gli invii restano bloccati. Gli elementi “da risolvere” verranno eliminati; gli interventi in corso di invio restano al sicuro. Continuare?')) return;
            await ripristinaApp(bloccati);
            if (typeof window !== 'undefined') window.location.reload();
          }}
          className="mt-2 w-full rounded-xl border border-[var(--brand-border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          Svuota cache e ricarica
        </button>
      </div>
    </div>
  );
}
