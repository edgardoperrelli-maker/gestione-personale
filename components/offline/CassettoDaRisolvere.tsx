/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { rimuoviItemEBlob, ripristinaApp, riprovaItem } from '@/lib/offline/ripristino';
import { sincronizzaToken } from '@/lib/offline/sync';
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
  /** Conferma del ripristino "come navigazione anonima" (era un window.confirm bloccante). */
  const [confermaRipristino, setConfermaRipristino] = useState(false);
  const [ripristinando, setRipristinando] = useState(false);
  /** Id dell'elemento in corso di rientro: tiene il suo «Riprova» in caricamento, non tutti. */
  const [riprovando, setRiprovando] = useState<string | null>(null);

  // Parte SOLO dalla conferma della ConfirmDialog.
  const eseguiRipristino = async () => {
    setRipristinando(true);
    try {
      await ripristinaApp(items);
      window.location.reload();
    } finally {
      setRipristinando(false);
    }
  };

  if (items.length === 0) return null;
  return (
    <div className="mx-3 mb-3 rounded-[var(--radius-xl)] border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
      <div className="mb-2 text-sm font-semibold text-[var(--danger)]">
        {items.length === 1
          ? '1 elemento da risolvere'
          : <><span className="font-mono tabular-nums">{items.length}</span> elementi da risolvere</>}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--brand-surface)] p-2.5">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--brand-text-main)]">{ETICHETTA[it.type]}</div>
              <div className="text-xs text-[var(--brand-text-muted)]">{it.ultimoErrore ?? 'Non sincronizzabile'}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              {/* «Riprova» prima di «Rimuovi», e per primo: quando il blocco dipendeva dal server
                  (non dalla pratica), rimuovere significa buttare un lavoro già fatto — foto
                  comprese — e mandare l'operatore a rifarlo sul posto. */}
              <Button
                variant="outline"
                size="touch"
                disabled={riprovando === it.id}
                loading={riprovando === it.id}
                onClick={async () => {
                  setRiprovando(it.id);
                  try {
                    await riprovaItem(it);
                    await sincronizzaToken(it.token);
                  } finally {
                    setRiprovando(null);
                    onRimosso();
                  }
                }}
              >
                Riprova
              </Button>
              {/* Disabilitato finché un rientro è in volo — anche di un'ALTRA riga: la sync
                  lavora su uno snapshot della coda, e cancellare qui in mezzo farebbe riscrivere
                  l'elemento appena rimosso con i suoi blob foto ormai eliminati. */}
              <Button
                variant="outline"
                size="touch"
                disabled={riprovando !== null}
                onClick={async () => { await rimuoviItemEBlob(it); onRimosso(); }}
              >
                Rimuovi
              </Button>
            </div>
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
      <Button
        variant="outline"
        size="touch"
        disabled={riprovando !== null}
        onClick={() => setConfermaRipristino(true)}
        className="mt-3 w-full text-[var(--danger)]"
      >
        Svuota cache e ricarica
      </Button>

      <ConfirmDialog
        open={confermaRipristino}
        danger
        size="touch"
        loading={ripristinando}
        title="Svuota cache e ricarica"
        message={'Gli elementi “da risolvere” qui sopra verranno eliminati (andranno rifatti). Gli interventi in corso di invio restano al sicuro.'}
        confirmLabel="Svuota e ricarica"
        onConfirm={() => { void eseguiRipristino(); }}
        onClose={() => setConfermaRipristino(false)}
      />
    </div>
  );
}