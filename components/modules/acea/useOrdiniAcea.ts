'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RigaTabella } from '@/lib/acea/colonneTabella';
import {
  OPZIONI_VUOTE, filtriVuoti, parametriQuery,
  type FiltriUI, type Opzioni, type ScadenzaFiltro, type StatoFiltro,
} from '@/lib/acea/filtriOrdini';

export type { FiltriUI, Opzioni, ScadenzaFiltro, StatoFiltro };
export { filtriVuoti };

/** Quante righe si caricano per volta. Il registro può averne 5.000+: si pagina. */
const PER_PAGINA = 300;

type Risposta = {
  righe: RigaTabella[];
  totale: number;
  pagina: number;
  perPagina: number;
  oggi: string;
};

/**
 * Carica il registro con i filtri correnti, a pagine.
 *
 * Il caricamento è incrementale ("carica altre"): con 5.293 righe scaricare tutto a ogni cambio
 * di filtro sarebbe lento e inutile, perché chi pianifica lavora sempre su un sottoinsieme
 * filtrato. Il totale però arriva dal server, così il conteggio è sempre quello vero e non
 * quello delle righe scaricate.
 *
 * Anche i filtri delle intestazioni passano di qui e diventano query: filtrare le righe già
 * caricate darebbe un risultato che sembra giusto ed è sbagliato, perché escluderebbe le 4.993
 * righe non ancora scese.
 */
export function useOrdiniAcea(famiglia: 'dunning' | 'massive', refreshKey = 0) {
  const [filtri, setFiltri] = useState<FiltriUI>(filtriVuoti);
  const [righe, setRighe] = useState<RigaTabella[]>([]);
  const [totale, setTotale] = useState(0);
  const [oggi, setOggi] = useState('');
  const [pagina, setPagina] = useState(1);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [opzioni, setOpzioni] = useState<Opzioni>(OPZIONI_VUOTE);
  // Evita che una risposta lenta di un filtro vecchio sovrascriva quella del filtro corrente.
  const richiestaCorrente = useRef(0);

  // La stringa e non l'oggetto: `filtri` è annidato e cambia identità a ogni set, mentre la query
  // cambia solo quando cambia davvero un criterio.
  const query = useMemo(
    () => parametriQuery(filtri, famiglia, PER_PAGINA).toString(),
    [filtri, famiglia],
  );

  const carica = useCallback(async (pag: number, accoda: boolean) => {
    const mio = ++richiestaCorrente.current;
    setCaricando(true);
    try {
      const p = new URLSearchParams(query);
      p.set('pagina', String(pag));
      const res = await fetch(`/api/acea/ordini?${p.toString()}`);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Registro non disponibile.');
      }
      const dati = (await res.json()) as Risposta;
      if (mio !== richiestaCorrente.current) return; // risposta sorpassata: si scarta
      setRighe((prec) => (accoda ? [...prec, ...dati.righe] : dati.righe));
      setTotale(dati.totale);
      setOggi(dati.oggi);
      setPagina(dati.pagina);
      setErrore(null);
    } catch (e) {
      if (mio !== richiestaCorrente.current) return;
      setErrore(e instanceof Error ? e.message : 'Registro non disponibile.');
    } finally {
      if (mio === richiestaCorrente.current) setCaricando(false);
    }
  }, [query]);

  // Cambio filtri (o refresh esterno dopo un import): si riparte dalla prima pagina.
  useEffect(() => { void carica(1, false); }, [carica, refreshKey]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/acea/opzioni?famiglia=${famiglia}`);
        if (res.ok && vivo) setOpzioni((await res.json()) as Opzioni);
      } catch {
        /* gli elenchi restano vuoti: i filtri a testo e la ricerca funzionano lo stesso */
      }
    })();
    return () => { vivo = false; };
  }, [famiglia, refreshKey]);

  const altre = useCallback(() => { void carica(pagina + 1, true); }, [carica, pagina]);
  const ricarica = useCallback(() => { void carica(1, false); }, [carica]);

  return {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni,
    altre, ricarica,
    perPagina: PER_PAGINA,
    tutteCaricate: righe.length >= totale,
  };
}
