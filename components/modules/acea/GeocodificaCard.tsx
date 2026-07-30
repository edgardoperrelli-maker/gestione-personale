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
 * Un blocco, con la risposta letta senza dare per scontato che sia JSON.
 *
 * Quando il server viene troncato a metà (timeout della funzione, gateway che molla) la risposta è
 * una pagina HTML, e `res.json()` esplode con un «Unexpected token <» che non dice niente a chi lo
 * legge. Qui il testo si prende grezzo e si prova a interpretarlo: se non è JSON, il messaggio
 * dice cos'è successo davvero.
 */
async function blocco(url: string): Promise<Esito> {
  const res = await fetch(url, { method: 'POST' });
  const testo = await res.text();
  let body: (Esito & { error?: string }) | null = null;
  try {
    body = JSON.parse(testo) as Esito & { error?: string };
  } catch {
    throw new Error(
      res.ok
        ? 'Il server ha risposto qualcosa che non è un blocco di geocodifica.'
        : `Il blocco si è interrotto (HTTP ${res.status}).`,
    );
  }
  if (!res.ok) throw new Error(body?.error ?? 'Geocodifica non riuscita.');
  return body;
}

/**
 * Geocodifica del registro e numerazione delle microaree.
 *
 * Il gruppo in tabella nasce dalle COORDINATE, non dal CAP: a Roma un CAP è largo chilometri, e
 * due misuratori con lo stesso CAP possono stare a mezz'ora l'uno dall'altro.
 *
 * Il server lavora a BLOCCHI perché la funzione ha un minuto di vita e i provider vanno a una
 * richiesta al secondo; il pulsante però macina da sé, richiamandolo finché il contatore non
 * arriva a zero. Il blocco si chiude a TEMPO, non a conteggio: quanti indirizzi ci stiano dipende
 * da cosa capita in coda, perché uno già visto esce dalla cache in un decimo di secondo e uno da
 * rincorrere ne costa quindici.
 *
 * È un giro lungo — sul registro vero sono ore, non minuti — e gira dal browser: la pagina va
 * lasciata aperta. Per questo il tempo che resta si mostra sul ritmo MISURATO e non su una media
 * ottimista: chi legge «~27 min» chiude il portatile a metà.
 *
 * I numeri di gruppo si assegnano SOLO a registro completo: rinumerare a metà darebbe numeri che
 * cambiano a ogni blocco, cioè inservibili per dire a qualcuno «fai il 12».
 */
/**
 * Quanto costa un indirizzo nuovo, misurato sul registro vero: **~6 secondi**, non uno.
 *
 * Il secondo era il rate limit di Nominatim, cioè il costo di UNA richiesta — ma un indirizzo non
 * ne fa una. La cascata prova Nominatim strutturato, poi il testo libero col CAP, poi senza, poi
 * Photon: quando le prime rispondono «niente» si arriva alla quarta, e sono quattro secondi di
 * attesa più la rete. Sui 1.213 indirizzi ancora da risolvere la media misurata è 5,8 s.
 *
 * Serve come punto di partenza: appena il ciclo gira, `ritmoMisurato` prende il suo posto.
 */
const SECONDI_PER_INDIRIZZO = 6;

/**
 * Il tempo che resta.
 *
 * Una stima ottimista di cinque volte non è un dettaglio estetico: dice «~27 min» per un lavoro da
 * due ore e mezza, e chi legge chiude il portatile a metà — poi trova il registro a pezzi e pensa
 * che il pulsante sia rotto. Meglio un numero grande e vero.
 */
function quantoManca(righe: number, secondiPerRiga = SECONDI_PER_INDIRIZZO): string {
  const min = Math.round((righe * secondiPerRiga) / 60);
  if (min < 1) return 'meno di un minuto';
  if (min < 60) return `~${min} min`;
  return `~${Math.floor(min / 60)}h ${min % 60}min`;
}

export default function GeocodificaCard() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [busy, setBusy] = useState<'macina' | 'gruppi' | null>(null);
  const [risolti, setRisolti] = useState(0);
  // Secondi per indirizzo osservati DA QUESTO giro. La media a tavolino vale finché non si hanno
  // dati veri: gli indirizzi ripetuti escono dalla cache in un decimo di secondo e quelli rincorsi
  // ne costano quindici, quindi il ritmo dipende da cosa capita in coda, non da una costante.
  const [ritmo, setRitmo] = useState<number | null>(null);
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
   * Tre salvagenti, perché è un ciclo che chiama la rete:
   * - **Ferma**, che l'utente può premere in qualunque momento (il blocco in corso finisce, il
   *   successivo non parte);
   * - **avanzamento obbligato**: se dopo un blocco le righe rimaste non sono DIMINUITE, il ciclo
   *   si interrompe da solo. Senza, una riga che non si riesce a marcare terrebbe il ciclo a
   *   martellare l'endpoint per sempre.
   * - **un secondo tentativo**, e uno solo. Un giro da mezz'ora buttato per un singolo blocco
   *   andato storto è uno spreco che si ripara con un ritentativo; ritentare all'infinito invece
   *   trasformerebbe un guasto vero in un martellamento silenzioso. Il conto si azzera dopo ogni
   *   blocco riuscito, perché due inciampi lontani fra loro non sono un guasto.
   */
  const macina = useCallback(async () => {
    fermare.current = false;
    setBusy('macina');
    setRisolti(0);
    setRitmo(null);
    const avvio = Date.now();
    let fatti = 0;
    let precedenti = Number.POSITIVE_INFINITY;
    let inciampi = 0;

    try {
      for (;;) {
        if (fermare.current) {
          toast.info(`Fermato: ${fatti} indirizzi risolti.`);
          break;
        }

        let body: Esito;
        try {
          body = await blocco(ENDPOINT);
          inciampi = 0;
        } catch (e) {
          inciampi += 1;
          if (inciampi > 1) throw e;
          toast.info('Un blocco non è andato a buon fine: riprovo una volta.');
          continue;
        }

        fatti += body.geocodificati;
        setRisolti(fatti);
        if (fatti > 0) setRitmo((Date.now() - avvio) / 1000 / fatti);
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
      const body = await blocco(`${ENDPOINT}?azione=gruppi`);
      toast.success(`${body.microaree} microaree, ${body.stimati} gruppi stimati.`);
      await carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rinumerazione non riuscita.');
    } finally {
      setBusy(null);
    }
  }, [carica]);

  const daFare = stato?.daFare ?? 0;
  const stima = quantoManca(daFare, ritmo ?? SECONDI_PER_INDIRIZZO);

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
              {risolti} risolti, ne restano {daFare} ({stima})
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
              {daFare > 0 ? `Geocodifica ${daFare} indirizzi (${stima})` : 'Tutto geocodificato'}
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
