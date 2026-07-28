'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Play, Square, TriangleAlert } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';

const ENDPOINT = '/api/acea/geocodifica';

type Stato = {
  totale: number;
  daFare: number;
  fuoriRegione: number;
  nonTrovati: number;
  conGruppo: number;
  stimati: number;
};

type Esito = { geocodificati: number; rimaste: number; microaree: number; senzaGruppo: number; stimati: number };

/**
 * Geocodifica del registro e numerazione delle microaree.
 *
 * Il gruppo in tabella nasce dalle COORDINATE, non dal CAP: a Roma un CAP è largo chilometri, e
 * due misuratori con lo stesso CAP possono stare a mezz'ora l'uno dall'altro.
 *
 * Il server lavora a BLOCCHI perché Nominatim consente una richiesta al secondo e un blocco deve
 * stare nel minuto di `maxDuration`; il pulsante però macina da sé, richiamandolo finché il
 * contatore non arriva a zero. Gli indirizzi già visti escono dalla cache e non costano niente,
 * quindi i blocchi successivi sono molto più rapidi del primo.
 *
 * I numeri di gruppo si assegnano SOLO a registro completo: rinumerare a metà darebbe numeri che
 * cambiano a ogni blocco, cioè inservibili per dire a qualcuno «fai il 12».
 */
/** Stima grossolana del tempo che resta: i provider vanno a ~1 indirizzo al secondo. */
function quantoManca(righe: number): string {
  const min = Math.round(righe / 60);
  if (min < 1) return 'meno di un minuto';
  if (min < 60) return `~${min} min`;
  return `~${Math.floor(min / 60)}h ${min % 60}min`;
}

export default function GeocodificaCard() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [busy, setBusy] = useState<'macina' | 'gruppi' | null>(null);
  const [risolti, setRisolti] = useState(0);
  // `ref` e non `state`: il ciclo la legge a ogni giro, e uno state catturato nella closure
  // resterebbe al valore che aveva quando il ciclo è partito — il tasto Ferma non farebbe niente.
  const fermare = useRef(false);

  const carica = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) setStato((await res.json()) as Stato);
    } catch {
      /* il riquadro è di servizio: se non arriva, il resto degli strumenti funziona */
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  // Se si lascia la pagina a metà, il ciclo si ferma: le richieste in volo non si annullano, ma
  // non se ne accodano altre a un componente che non c'è più.
  useEffect(() => () => { fermare.current = true; }, []);

  /**
   * Macina i blocchi finché il contatore non arriva a zero.
   *
   * Un blocco solo copre ~40 indirizzi, quanto sta nel minuto di `maxDuration` a una richiesta al
   * secondo: per 949 righe sarebbero due dozzine di clic. Il ciclo li fa da sé.
   *
   * Due salvagenti, perché è un ciclo che chiama la rete:
   * - **Ferma**, che l'utente può premere in qualunque momento (il blocco in corso finisce, il
   *   successivo non parte);
   * - **avanzamento obbligato**: se dopo un blocco le righe rimaste non sono DIMINUITE, il ciclo
   *   si interrompe da solo. Senza, una riga che non si riesce a marcare terrebbe il ciclo a
   *   martellare l'endpoint per sempre.
   */
  const macina = useCallback(async () => {
    fermare.current = false;
    setBusy('macina');
    setRisolti(0);
    let fatti = 0;
    let precedenti = Number.POSITIVE_INFINITY;

    try {
      for (;;) {
        if (fermare.current) {
          toast.info(`Fermato: ${fatti} indirizzi risolti.`);
          break;
        }

        const res = await fetch(ENDPOINT, { method: 'POST' });
        const body = (await res.json()) as Esito & { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Geocodifica non riuscita.');

        fatti += body.geocodificati;
        setRisolti(fatti);
        // Il contatore si aggiorna a ogni blocco invece che alla fine: su un giro da un quarto
        // d'ora, un riquadro fermo sembra un riquadro rotto.
        setStato((s) => (s ? { ...s, daFare: body.rimaste } : s));

        if (body.rimaste === 0) {
          toast.success(`Geocodifica completata: ${fatti} indirizzi, ${body.microaree} microaree.`);
          break;
        }
        if (body.rimaste >= precedenti) {
          toast.error(`Il ciclo non avanza: restano ${body.rimaste} righe che nessun blocco riesce a chiudere.`);
          break;
        }
        precedenti = body.rimaste;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geocodifica non riuscita.');
    } finally {
      setBusy(null);
      await carica();
    }
  }, [carica]);

  const rinumera = useCallback(async () => {
    setBusy('gruppi');
    try {
      const res = await fetch(`${ENDPOINT}?azione=gruppi`, { method: 'POST' });
      const body = (await res.json()) as Esito & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Rinumerazione non riuscita.');
      toast.success(`${body.microaree} microaree, ${body.stimati} gruppi stimati.`);
      await carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rinumerazione non riuscita.');
    } finally {
      setBusy(null);
    }
  }, [carica]);

  const daFare = stato?.daFare ?? 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin size={18} className="text-[var(--brand-text-muted)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Microaree</h2>
        <span className="text-xs text-[var(--brand-text-muted)]">
          il numero di gruppo in tabella, dalle coordinate degli indirizzi
        </span>
      </div>

      {stato && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile label="Gruppo misurato" value={stato.conGruppo} size="sm" tone="ok" />
          {/* Prestato dal CAP/comune: una zona approssimata, mostrata in tabella con la tilde. */}
          <StatTile label="Gruppo stimato (~)" value={stato.stimati} size="sm" />
          <StatTile label="Da geocodificare" value={stato.daFare} size="sm" tone={daFare > 0 ? 'warn' : 'neutral'} />
          <StatTile
            label="Fuori dal Lazio"
            value={stato.fuoriRegione}
            size="sm"
            tone={stato.fuoriRegione > 0 ? 'danger' : 'neutral'}
          />
        </div>
      )}

      {/*
        «Fuori dal Lazio» non è un dato mancante, è un dato SBAGLIATO: il provider ha risposto con
        l'omonimo di un'altra regione. Tenerlo separato dai non trovati è ciò che permette di
        accorgersene — un gruppo costruito su quel punto manderebbe una squadra a fare un giro
        che non esiste.
      */}
      {stato && stato.fuoriRegione > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--brand-text-main)]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[var(--warning)]" aria-hidden="true" />
          <span>
            <strong>{stato.fuoriRegione} indirizzi</strong> sono stati risolti fuori dal Lazio, anche
            dopo il secondo tentativo forzato sulla regione: quasi sempre è un indirizzo ACEA
            incompleto o con un omonimo altrove. Restano senza gruppo — meglio nessuna zona che una
            sbagliata.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {busy === 'macina' ? (
          <>
            <Button variant="outline" size="sm" onClick={() => { fermare.current = true; }}>
              <Square size={13} aria-hidden="true" />
              Ferma
            </Button>
            <span
              className="text-xs text-[var(--brand-text-main)]"
              role="status"
              aria-live="polite"
            >
              {risolti} risolti, ne restano {daFare} ({quantoManca(daFare)})
            </span>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void macina()}
              disabled={daFare === 0 || busy !== null}
            >
              <Play size={14} aria-hidden="true" />
              {daFare > 0 ? `Geocodifica ${daFare} indirizzi (${quantoManca(daFare)})` : 'Tutto geocodificato'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rinumera()}
              loading={busy === 'gruppi'}
              disabled={busy !== null}
            >
              Rinumera le microaree
            </Button>
          </>
        )}
        <span className="w-full text-xs text-[var(--brand-text-muted)] sm:w-auto">
          {busy === 'macina'
            ? 'lascia aperta questa pagina: il ciclo gira dal browser'
            : 'macina da sé fino a zero, un indirizzo al secondo (limite dei provider gratuiti)'}
        </span>
      </div>
    </Card>
  );
}
