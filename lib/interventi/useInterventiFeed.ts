'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

/** Riga `interventi` consumata dalle viste live del giorno (torre + mappa monitoraggio). */
export type TorreIntervento = {
  id: string;
  odl: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  pdr: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  lat: number | null;
  lng: number | null;
  staff_id: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
  fascia_oraria: string | null;
  territorio_id: string | null;
};

/** Orario locale italiano HH:MM (per l'indicatore "ultimo aggiornamento"). */
function oraIt(): string {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export type InterventiFeed = {
  items: TorreIntervento[];
  setItems: Dispatch<SetStateAction<TorreIntervento[]>>;
  live: boolean;
  lastUpdate: string | null;
  /** Status HTTP dell'ultima fetch fallita (es. 403); null se l'ultima è andata a buon fine. */
  error: number | null;
  refresh: () => Promise<void>;
};

/**
 * Feed live degli interventi del giorno, condiviso da torre e mappa di monitoraggio.
 * Incapsula in un solo posto: fetch (`GET /api/interventi/giorno`), fetch iniziale,
 * subscription Realtime (upsert/replace/delete) e polling ogni 5 minuti con pausa
 * quando la scheda è in background. Eliminando la duplicazione, un eventuale fix
 * all'upsert vale per entrambe le viste.
 *
 * @param data giorno YYYY-MM-DD
 * @param options.channelPrefix prefisso del canale Realtime (default `'feed'`); il canale è `${prefix}-${data}`
 * @param options.initialItems valore iniziale di `items` (es. i dati SSR della torre, per evitare il flash a vuoto)
 */
export function useInterventiFeed(
  data: string,
  options: { channelPrefix?: string; initialItems?: TorreIntervento[] } = {},
): InterventiFeed {
  const { channelPrefix = 'feed', initialItems = [] } = options;
  const [items, setItems] = useState<TorreIntervento[]>(initialItems);
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/interventi/giorno?data=${data}`, { cache: 'no-store' });
      if (!res.ok) {
        setError(res.status);
        return;
      }
      const json = (await res.json()) as { interventi?: TorreIntervento[] };
      setItems(json.interventi ?? []);
      setError(null);
      setLastUpdate(oraIt());
    } catch {
      /* errore di rete: ritenta al prossimo giro di polling */
    }
  }, [data]);

  // Fetch iniziale + a ogni cambio data
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime su interventi del giorno (upsert/replace/delete)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`${channelPrefix}-${data}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventi', filter: `data=eq.${data}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string } | null)?.id;
              return oldId ? prev.filter((x) => x.id !== oldId) : prev;
            }
            const next = payload.new as TorreIntervento;
            if (!next?.id) return prev;
            const idx = prev.findIndex((x) => x.id === next.id);
            if (idx === -1) return [...prev, next];
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
          setLastUpdate(oraIt());
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data, channelPrefix]);

  // Polling 5 min, in pausa quando la scheda è in background
  useEffect(() => {
    const INTERVAL = 5 * 60 * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void refresh(), INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { void refresh(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  return { items, setItems, live, lastUpdate, error, refresh };
}
