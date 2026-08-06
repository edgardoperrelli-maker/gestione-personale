'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { RigaTabella } from '@/lib/acea/colonneTabella';
import type { Famiglia } from '@/lib/acea/famiglia';
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
  /** Attivazioni aperte senza data di pianificazione: il triangolo della scheda. `null` = non calcolabile. */
  riapertureSenzaData?: number | null;
  /** Comuni massive con ordini aperti: le schede della vista. `null` = non calcolato stavolta. */
  comuniMassive?: string[] | null;
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
export function useOrdiniAcea(
  famiglia: Famiglia,
  /**
   * I comuni-scheda al primo render, letti dal server nella pagina (solo massive). Servono
   * PRIMA della prima risposta: senza, la prima interrogazione partirebbe senza scheda e
   * mostrerebbe gli aperti di tutti i paesi sotto il tasto del primo.
   */
  comuniIniziali: readonly string[] = [],
) {
  const params = useSearchParams();
  /*
    `?cerca=<odl>` nella URL apre il registro gia` su quella riga.

    Serve ai link che arrivano da fuori — oggi dagli avvisi dell'import, che segnalano righe da
    controllare: senza questa lettura il link atterrava sul registro intatto, e sembrava un link
    rotto pur essendo l'indirizzo giusto.

    Insieme alla ricerca si passa a «Tutti»: una riga segnalata puo` benissimo essere chiusa, e
    atterrare su «Da lavorare» con una ricerca che non trova niente e` peggio che non linkarla.
    In massive «Tutti» non ha piu` una scheda, ma resta uno stato valido: la ricerca deve poter
    attraversare aperti e chiusi anche li` — la fila delle schede semplicemente non ne accende
    nessuna finche` non se ne clicca una.
  */
  const [filtri, setFiltri] = useState<FiltriUI>(() => {
    const iniziali = filtriVuoti();
    if (famiglia === 'massive') {
      // Si apre sul primo comune. Senza comuni aperti (campagna finita, o lettura server
      // fallita) si apre sui «Chiusi»: una vista vera, non un «Da lavorare» senza tasto.
      iniziali.comuneScheda = comuniIniziali[0] ?? null;
      if (iniziali.comuneScheda === null) iniziali.stato = 'chiusi';
    }
    const cerca = params?.get('cerca')?.trim();
    if (cerca) {
      iniziali.cerca = cerca;
      iniziali.stato = 'tutti';
      iniziali.comuneScheda = null;
    }
    /*
      `?stato=saracinesche&sara=…` apre il registro già sul passo del ciclo che si vuole fare.

      È il collegamento dalla card di Strumenti, che resta il cruscotto — i numeri e il valore a
      rischio — e manda alla tabella per lavorarci. Senza questa lettura il link avrebbe portato
      sulla scheda-comune di default, con un conteggio diverso da quello appena cliccato.

      Solo `saracinesche` e non uno stato qualsiasi: è l'unica scheda a cui si arriva da fuori, e
      accettare qualunque valore renderebbe la URL una seconda via per pilotare la vista, da
      tenere allineata a mano con la fila delle schede.
    */
    if (params?.get('stato') === 'saracinesche') {
      iniziali.stato = 'saracinesche';
      iniziali.comuneScheda = null;
      const sara = params.get('sara');
      if (sara === 'per_acea' || sara === 'da_esitare') iniziali.sara = sara;
    }
    return iniziali;
  });
  /*
    La fila delle schede-comune (solo massive), aggiornata da ogni risposta della lista: un
    import che aggiunge un paese fa comparire il tasto, un comune completato lo fa sparire.
    Su `null` (lettura fallita lato server) si TIENE l'ultima fila buona: le schede sono
    struttura, non un contatore — a differenza del triangolo, sparire sarebbe peggio che
    invecchiare di un giro.
  */
  const [comuniMassive, setComuniMassive] = useState<string[]>([...comuniIniziali]);
  const [righe, setRighe] = useState<RigaTabella[]>([]);
  const [totale, setTotale] = useState(0);
  const [oggi, setOggi] = useState('');
  const [pagina, setPagina] = useState(1);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [opzioni, setOpzioni] = useState<Opzioni>(OPZIONI_VUOTE);
  /*
    Il triangolo della scheda «Riaperture». Stato SEPARATO dalle righe, di proposito: il numero non
    dipende dalla scheda su cui si sta — dice quante attivazioni sono fuori calendario mentre si
    guarda qualunque vista. `null` finché non arriva (o se il server non l'ha saputo calcolare):
    un «0» mostrato prima di sapere sarebbe una rassicurazione non guadagnata.
  */
  const [riapertureSenzaData, setRiapertureSenzaData] = useState<number | null>(null);
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
      // Anche il `null` si propaga: è il server che dice «non l'ho saputo calcolare», e il
      // triangolo deve SPARIRE — tenere l'ultimo numero riuscito significherebbe gridare «3 fuori
      // calendario» dopo che le tre sono state pianificate, per tutta la sessione. Si scarta solo
      // `undefined` (campo assente: risposta di una versione che il numero non lo conosce).
      if (dati.riapertureSenzaData !== undefined) {
        setRiapertureSenzaData(dati.riapertureSenzaData);
      }
      // `null` qui significa «non calcolato stavolta», e si tiene la fila precedente (vedi sopra).
      if (dati.comuniMassive !== undefined && dati.comuniMassive !== null) {
        setComuniMassive(dati.comuniMassive);
      }
      setErrore(null);
    } catch (e) {
      if (mio !== richiestaCorrente.current) return;
      setErrore(e instanceof Error ? e.message : 'Registro non disponibile.');
    } finally {
      if (mio === richiestaCorrente.current) setCaricando(false);
    }
  }, [query]);

  // Cambio filtri: si riparte dalla prima pagina.
  useEffect(() => { void carica(1, false); }, [carica]);

  /*
    La scheda-comune resta agganciata a un comune che ESISTE.

    Il caso vero: il comune su cui si sta lavorando finisce (ultimo ordine chiuso, o un import
    lo chiude) e il suo tasto sparisce dalla fila — si passa al primo paese rimasto, o ai
    «Chiusi» se non resta niente da pianificare. Si tocca solo chi sta su una scheda-comune:
    chi è su Chiusi/Saracinesche/Tutti non viene spostato da sotto i piedi.
  */
  useEffect(() => {
    if (famiglia !== 'massive') return;
    setFiltri((f) => {
      if (f.stato !== 'aperti') return f;
      if (f.comuneScheda !== null && comuniMassive.includes(f.comuneScheda)) return f;
      const primo = comuniMassive[0] ?? null;
      if (primo === null) {
        return f.comuneScheda === null ? f : { ...f, stato: 'chiusi', comuneScheda: null };
      }
      return { ...f, comuneScheda: primo };
    });
  }, [famiglia, comuniMassive]);

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
  }, [famiglia]);

  const altre = useCallback(() => { void carica(pagina + 1, true); }, [carica, pagina]);
  const ricarica = useCallback(() => { void carica(1, false); }, [carica]);

  return {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni,
    riapertureSenzaData, comuniMassive,
    altre, ricarica,
    // La query esce dal hook perché l'export deve poter rifare *la stessa* interrogazione fino in
    // fondo. Ricostruirla dai filtri nel componente vorrebbe dire due costruttori di query da
    // tenere allineati a mano, e il giorno che divergono l'export mente senza accorgersene.
    query,
    perPagina: PER_PAGINA,
    tutteCaricate: righe.length >= totale,
  };
}
