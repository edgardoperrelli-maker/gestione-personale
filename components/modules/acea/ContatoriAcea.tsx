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
  /** Scadenze PER FAMIGLIA: i numeri delle viste-foglietta. I globali restano per l'hub. */
  scadutiDunning: number;
  inScadenzaDunning: number;
  scadutiMassive: number;
  inScadenzaMassive: number;
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
export default function ContatoriAcea({ famiglia }: {
  /**
   * Presente = vista-foglietta (Dunning / Massive): i contatori scendono a UNA RIGA.
   *
   * DESIGN.md §7ter: la testa a card-KPI è del MODULO — l'hub, dove quei numeri sono il
   * contenuto della pagina — mentre «le pagine-foglietta con Breadcrumb restano sul pattern
   * slim». Qui sotto c'è un registro da 800 ordini e la striscia piena costa 90px, cioè due
   * righe e mezza di lavoro a ogni schermata, per numeri che cambiano una o due volte al
   * giorno (agli import).
   *
   * La famiglia decide anche QUALE totale si mostra: sul dunning il numero delle massive è
   * quello dell'altra foglietta, e si prendeva un quinto della striscia in una vista dove non
   * si può farci niente.
   */
  famiglia?: 'dunning' | 'massive';
} = {}) {
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
      <Card className="p-2.5">
        <p className="text-sm text-[var(--brand-text-muted)]">{errore}</p>
      </Card>
    );
  }
  if (!dati) {
    // Lo scheletro ha la FORMA che avrà il contenuto: in riga non si monta il pannello, o alla
    // prima risposta la pagina si accorcerebbe di 60px trascinando su la tabella.
    return famiglia ? (
      <Skeleton className="h-7 w-full max-w-xl" />
    ) : (
      <Card className="p-2.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[62px]" />)}
        </div>
      </Card>
    );
  }

  const ore = oreDa(dati.ultimoImport?.caricato_il, dati.adesso);
  const vecchio = ore !== null && ore >= 24;

  /*
    Contatori in taglia `sm`.

    Sono un promemoria a colpo d'occhio, non il lavoro: il lavoro è la tabella sotto, e ogni pixel
    speso qui è una riga di ordini in meno a schermo. `size="sm"` è la leva già prevista dal
    primitivo (valore a `text-base` invece di `text-lg`) — non si tocca `StatTile`, che è condiviso
    con altri sedici moduli.
  */
  /*
    Vista-foglietta: una riga, non un pannello.

    Stessi numeri, stessi token di tono di `StatTile` (`--danger` / `--warning`), un decimo
    dell'altezza. La nota degli ordini incompleti smette di essere un paragrafo suo e diventa
    l'ultima voce della riga: è un'eccezione nota e attesa (le rimozioni allacci abusivi), non
    una notizia che meriti una riga propria sopra il registro.
  */
  if (famiglia) {
    /*
      I numeri della PROPRIA famiglia, non i globali: «oltre la scadenza» col totale del
      registro intero contava anche tutto il dunning sulla scheda massive — un numero vero al
      posto sbagliato, che è il modo peggiore di sbagliare. Il fallback `?? dati.scaduti`
      copre il minuto di deploy in cui il client nuovo interroga l'endpoint vecchio.
    */
    const aperti = famiglia === 'dunning'
      ? { n: dati.apertiDunning, testo: 'dunning aperti' }
      : { n: dati.apertiMassive, testo: 'massive aperte' };
    const scaduti = (famiglia === 'dunning' ? dati.scadutiDunning : dati.scadutiMassive) ?? dati.scaduti;
    const inScadenza = (famiglia === 'dunning' ? dati.inScadenzaDunning : dati.inScadenzaMassive) ?? dati.inScadenza;
    const voci: { n: number | string; testo: string; colore?: string }[] = [
      aperti,
      { n: scaduti, testo: 'oltre la scadenza', colore: scaduti > 0 ? 'var(--danger)' : undefined },
      { n: inScadenza, testo: 'in scadenza (7 gg)', colore: inScadenza > 0 ? 'var(--warning)' : undefined },
    ];
    if (dati.senzaMisuratore > 0) {
      voci.push({ n: dati.senzaMisuratore, testo: 'senza impianto né matricola' });
    }
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--brand-text-muted)]">
        {voci.map((v, i) => (
          <span key={v.testo} className="flex items-baseline gap-1.5">
            {i > 0 && <span aria-hidden="true" className="mr-1.5 text-[var(--brand-border-strong)]">·</span>}
            <span
              className="font-mono tabular-nums font-semibold"
              style={{ color: v.colore ?? 'var(--brand-text-main)' }}
            >
              {v.n}
            </span>
            {v.testo}
          </span>
        ))}
        <span className="flex items-baseline gap-1.5">
          <span aria-hidden="true" className="mr-1.5 text-[var(--brand-border-strong)]">·</span>
          import
          <span
            className="font-mono tabular-nums font-semibold"
            style={{ color: ore === null || vecchio ? 'var(--warning)' : 'var(--brand-text-main)' }}
          >
            {ore === null ? 'mai' : ore === 0 ? 'ora' : `${ore} h fa`}
          </span>
          {dati.ultimoImport && (
            <span className="text-[var(--brand-text-subtle)]">
              (<span className="font-mono tabular-nums">{dati.ultimoImport.righe_totali}</span> righe)
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <Card className="space-y-1.5 p-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Dunning aperti" value={dati.apertiDunning} size="sm" />
        <StatTile label="Massive aperte" value={dati.apertiMassive} size="sm" />
        <StatTile
          label="Oltre la scadenza"
          value={dati.scaduti}
          size="sm"
          tone={dati.scaduti > 0 ? 'danger' : 'ok'}
        />
        <StatTile
          label="In scadenza (7 gg)"
          value={dati.inScadenza}
          size="sm"
          tone={dati.inScadenza > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Ultimo import"
          value={ore === null ? 'mai' : ore === 0 ? 'ora' : `${ore} h fa`}
          size="sm"
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
