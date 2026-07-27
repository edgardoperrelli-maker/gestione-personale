'use client';

import { useCallback, useEffect, useState } from 'react';
import StatTile from '@/components/ui/StatTile';
import Skeleton from '@/components/ui/Skeleton';

type Riepilogo = {
  oggi: string;
  apertiDunning: number;
  apertiMassive: number;
  scaduti: number;
  inScadenza: number;
  senzaMisuratore: number;
  ultimoImport: { caricato_il: string; righe_totali: number; finestra_dal: string | null; finestra_al: string | null } | null;
};

/** Da quante ore il registro non viene aggiornato. Null se non è mai stato importato nulla. */
function oreDa(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
}

/**
 * Contatori di testa del modulo.
 *
 * L'età dell'ultimo import è in evidenza di proposito: con l'import manuale il rischio non è
 * un dato sbagliato, è un dato vecchio che nessuno sa essere vecchio.
 */
export default function ContatoriAcea({ refreshKey = 0 }: { refreshKey?: number }) {
  const [dati, setDati] = useState<Riepilogo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/acea/ordini', { method: 'POST' });
      if (!res.ok) {
        setErrore('Riepilogo non disponibile.');
        return;
      }
      setDati((await res.json()) as Riepilogo);
      setErrore(null);
    } catch {
      setErrore('Riepilogo non disponibile.');
    }
  }, []);

  useEffect(() => { void carica(); }, [carica, refreshKey]);

  if (errore) {
    return <p className="text-sm text-[var(--brand-text-muted)]">{errore}</p>;
  }
  if (!dati) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  const ore = oreDa(dati.ultimoImport?.caricato_il);
  const vecchio = ore !== null && ore >= 24;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Dunning aperti" value={dati.apertiDunning} />
        <StatTile label="Massive aperte" value={dati.apertiMassive} />
        <StatTile
          label="Oltre la scadenza"
          value={dati.scaduti}
          tone={dati.scaduti > 0 ? 'danger' : 'ok'}
        />
        <StatTile
          label="In scadenza (7 gg)"
          value={dati.inScadenza}
          tone={dati.inScadenza > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Ultimo import"
          value={ore === null ? 'mai' : ore === 0 ? 'ora' : `${ore} h fa`}
          tone={ore === null || vecchio ? 'warn' : 'ok'}
          note={dati.ultimoImport ? `${dati.ultimoImport.righe_totali} righe` : 'nessun export caricato'}
        />
      </div>
      {dati.senzaMisuratore > 0 && (
        <p className="text-xs text-[var(--brand-text-muted)]">
          <span className="font-mono tabular-nums">{dati.senzaMisuratore}</span> ordini senza impianto
          né matricola (attesi sulle rimozioni allacci abusivi).
        </p>
      )}
    </div>
  );
}
