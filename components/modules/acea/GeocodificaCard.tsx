'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Play, TriangleAlert } from 'lucide-react';
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
 * Gira a blocchi e non tutto in una volta perché Nominatim consente una richiesta al secondo: 5.300
 * indirizzi sarebbero un'ora e mezza, ben oltre qualunque timeout. Il pulsante si ripreme finché il
 * contatore non arriva a zero; gli indirizzi già visti escono dalla cache e non costano niente,
 * quindi i blocchi successivi sono molto più rapidi del primo.
 *
 * I numeri di gruppo si assegnano SOLO a registro completo: rinumerare a metà darebbe numeri che
 * cambiano a ogni blocco, cioè inservibili per dire a qualcuno «fai il 12».
 */
export default function GeocodificaCard() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [busy, setBusy] = useState<'blocco' | 'gruppi' | null>(null);

  const carica = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) setStato((await res.json()) as Stato);
    } catch {
      /* il riquadro è di servizio: se non arriva, il resto degli strumenti funziona */
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const esegui = useCallback(async (azione: 'blocco' | 'gruppi') => {
    setBusy(azione);
    try {
      const res = await fetch(`${ENDPOINT}${azione === 'gruppi' ? '?azione=gruppi' : ''}`, { method: 'POST' });
      const body = (await res.json()) as Esito & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Geocodifica non riuscita.');
      if (azione === 'gruppi') {
        toast.success(`${body.microaree} microaree numerate.`);
      } else if (body.rimaste === 0) {
        toast.success(`Geocodifica completata: ${body.microaree} microaree.`);
      } else {
        toast.info(`${body.geocodificati} indirizzi risolti, ne restano ${body.rimaste}.`);
      }
      await carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geocodifica non riuscita.');
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
        <Button
          variant="primary"
          size="sm"
          onClick={() => void esegui('blocco')}
          loading={busy === 'blocco'}
          disabled={daFare === 0}
        >
          <Play size={14} aria-hidden="true" />
          {daFare > 0 ? `Geocodifica un blocco (ne restano ${daFare})` : 'Tutto geocodificato'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void esegui('gruppi')}
          loading={busy === 'gruppi'}
        >
          Rinumera le microaree
        </Button>
        <span className="w-full text-xs text-[var(--brand-text-muted)] sm:w-auto">
          un blocco alla volta: i provider gratuiti accettano una richiesta al secondo
        </span>
      </div>
    </Card>
  );
}
