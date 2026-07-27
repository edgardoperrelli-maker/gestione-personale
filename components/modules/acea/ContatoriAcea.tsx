'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import Skeleton from '@/components/ui/Skeleton';

type Riepilogo = {
  oggi: string;
  /** Orologio del server: l'età dell'import si misura su questo, non su quello del browser. */
  adesso: string;
  apertiDunning: number;
  apertiMassive: number;
  scaduti: number;
  inScadenza: number;
  senzaMisuratore: number;
  ultimoImport: { caricato_il: string; righe_totali: number; finestra_dal: string | null; finestra_al: string | null } | null;
};

/**
 * Da quante ore il registro non viene aggiornato. Null se non è mai stato importato nulla.
 *
 * Entrambi gli istanti vengono dal SERVER. Con `Date.now()` il conto misurava la distanza fra
 * l'orologio del browser e quello del server: su una macchina indietro di qualche ora il contatore
 * che deve gridare «questo dato è vecchio» diceva «un'ora fa». `Math.max(0, …)` perché un browser
 * avanti darebbe ore negative.
 */
function oreDa(iso: string | undefined, adesso: string | undefined): number | null {
  if (!iso) return null;
  const fine = adesso ? Date.parse(adesso) : Date.now();
  const inizio = Date.parse(iso);
  if (!Number.isFinite(fine) || !Number.isFinite(inizio)) return null;
  return Math.max(0, Math.floor((fine - inizio) / 3_600_000));
}

/**
 * Contatori di testa del modulo.
 *
 * L'età dell'ultimo import è in evidenza di proposito: con l'import manuale il rischio non è
 * un dato sbagliato, è un dato vecchio che nessuno sa essere vecchio.
 *
 * Le tessere stanno dentro una Card e non sul canvas della pagina: `StatTile` è un well senza bordo
 * su `--brand-surface-muted`, e nel tema chiaro quel token vale esattamente quanto `--brand-bg`
 * (`oklch(0.965 0.006 250)`, globals.css). Sul canvas i cinque riquadri sparivano — restavano solo
 * le etichette a mezz'aria. Sopra `--brand-surface` (bianco) il well si vede come previsto.
 */
export default function ContatoriAcea() {
  const [dati, setDati] = useState<Riepilogo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    try {
      const res = await fetch('/api/acea/ordini', { method: 'POST' });
      if (!res.ok) {
        // La causa il server l'ha gia` scritta: buttarla via lasciava l'utente con un messaggio
        // generico e nessun modo di capire se fosse una sessione scaduta o un guasto.
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setErrore(b.error ?? 'Riepilogo non disponibile.');
        return;
      }
      setDati((await res.json()) as Riepilogo);
      setErrore(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Riepilogo non disponibile.');
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  if (errore) {
    return (
      <Card className="p-3">
        <p className="text-sm text-[var(--brand-text-muted)]">{errore}</p>
      </Card>
    );
  }
  if (!dati) {
    return (
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
    );
  }

  const ore = oreDa(dati.ultimoImport?.caricato_il, dati.adesso);
  const vecchio = ore !== null && ore >= 24;

  return (
    <Card className="space-y-2 p-3">
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
    </Card>
  );
}
