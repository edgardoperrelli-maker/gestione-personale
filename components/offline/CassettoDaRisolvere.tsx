'use client';

import { rimuoviItemEBlob, ripristinaApp } from '@/lib/offline/ripristino';
import type { OutboxItem } from '@/lib/offline/types';

const ETICHETTA: Record<OutboxItem['type'], string> = {
  voce: 'Compilazione intervento',
  foto: 'Foto',
  agenda: 'Esito intervento',
  manuale: 'Intervento manuale',
  invia: 'Invio rapportino',
};

/**
 * Cassetto "da risolvere": elenca gli elementi della coda offline che non si possono
 * sincronizzare (link scaduto, rifiutati). Mostra il motivo e consente di rimuoverli
 * dalla coda (l'operatore contatta l'ufficio per i casi recuperabili).
 */
export function CassettoDaRisolvere({
  items,
  onRimosso,
}: {
  items: OutboxItem[];
  onRimosso: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
      <div className="mb-2 text-sm font-bold text-[var(--danger)]">
        {items.length === 1 ? '1 elemento da risolvere' : `${items.length} elementi da risolvere`}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--brand-surface)] p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--brand-text-main)]">{ETICHETTA[it.type]}</div>
              <div className="text-xs text-[var(--brand-text-muted)]">{it.ultimoErrore ?? 'Non sincronizzabile'}</div>
            </div>
            <button
              type="button"
              onClick={async () => { await rimuoviItemEBlob(it); onRimosso(); }}
              className="shrink-0 rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--danger)]"
            >
              Rimuovi
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-[var(--danger)]">Per i casi recuperabili (es. link scaduto) contatta l&apos;ufficio.</div>

      {/*
        Ripristino "come navigazione anonima": quando lo stato locale si impantana (vecchio bundle in
        cache, service worker incoerente) l'invio fallisce all'infinito anche se il codice server è
        corretto. Questo azzera cache + service worker + gli elementi qui bloccati e ricarica, così
        l'app riparte pulita. NON tocca gli interventi validi ancora in coda (solo questi "da risolvere").
      */}
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm('Svuota la cache dell’app e ricarica la pagina. Gli elementi “da risolvere” qui sopra verranno eliminati (andranno rifatti). Gli interventi in corso di invio restano al sicuro. Continuare?')) return;
          await ripristinaApp(items);
          window.location.reload();
        }}
        className="mt-3 w-full rounded-lg border border-[var(--danger)] px-3 py-2 text-xs font-bold text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-[var(--on-primary)]"
      >
        Svuota cache e ricarica
      </button>
    </div>
  );
}
