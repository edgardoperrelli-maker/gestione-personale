'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  celleDi,
  eventoDiUnCampo,
  normalizzaIntervallo,
  spostaFocus,
  type Cella,
  type Intervallo,
} from '@/lib/acea/editingGriglia';
import { testoRighe } from '@/lib/acea/righeAppunti';

/*
  Celle copiabili su una tabella qualunque — la metà in SOLA LETTURA di quello che il registro
  ordini fa da sempre.

  Nel registro ACEA si clicca una cella, si trascina o si fa shift-click per prendere un blocco,
  Ctrl+C e il contenuto è in Excel. Nelle altre tabelle dei moduli ACEA e AcquaLatina quel gesto
  non esisteva: per portare via una matricola si selezionava a mano col mouse, e su una cella con
  ellissi si portava via il testo troncato.

  Il motore vive in `lib/acea/editingGriglia` e `lib/acea/righeAppunti`: funzioni pure, già
  provate, che non sanno niente di ACEA nonostante il percorso — muovere il cursore dentro una
  griglia e citare una cella TSV sono le stesse operazioni ovunque. Riusarle era meglio che
  riscriverle: le decisioni difficili (la nota con un a capo dentro che spezza la riga incollata,
  il bordo che ferma le frecce) sono già state prese lì una volta.

  Qui NON si scrive: nessun incolla, nessun editor. Le tabelle che monta questo gancio hanno i
  loro editor per cella, e il filtro `eventoDiUnCampo` fa in modo che tastiera e appunti restino
  loro quando hanno il fuoco.
*/

export type OpzioniGrigliaCopiabile = {
  /** Numero di righe visibili, nell'ordine in cui si vedono. */
  righe: number;
  /** Intestazioni delle colonne copiabili, nell'ordine in cui si vedono. */
  colonne: readonly string[];
  /**
   * Il testo da mettere negli appunti per una cella. È il testo che si VEDE, non il dato
   * grezzo: una data va copiata come la si legge, uno stato in chiaro e non come chiave.
   */
  valoreCella: (riga: number, colonna: number) => string;
  /** Spegne l'ascolto quando la tabella non è a schermo (modale chiusa, altra scheda). */
  attivo?: boolean;
};

/** Elementi che si tengono il proprio click: cliccarli non deve spostare il cursore di cella. */
const INTERATTIVI = 'input, select, textarea, button, a, [role="button"], [contenteditable="true"]';

export function useGrigliaCopiabile({
  righe,
  colonne,
  valoreCella,
  attivo = true,
}: OpzioniGrigliaCopiabile) {
  const [focus, setFocus] = useState<Cella | null>(null);
  const [selezione, setSelezione] = useState<Intervallo | null>(null);

  const limiti = useMemo(() => ({ righe, colonne: colonne.length }), [righe, colonne.length]);

  /*
    I valori passano da un ref e non dalle dipendenze dell'effetto: `valoreCella` è una closure
    che il componente ricrea a ogni render, e metterla fra le dipendenze rimonterebbe i listener
    di window a ogni battuta di tasto in un filtro.
  */
  const valoreRef = useRef(valoreCella);
  valoreRef.current = valoreCella;
  const colonneRef = useRef(colonne);
  colonneRef.current = colonne;

  // La selezione si accorcia da sola quando la tabella si accorcia: un filtro che lascia tre
  // righe non deve tenere un cursore sulla ventesima, che poi copierebbe una cella inesistente.
  useEffect(() => {
    if (focus && (focus.riga >= righe || focus.colonna >= colonne.length)) {
      setFocus(null);
      setSelezione(null);
    }
  }, [righe, colonne.length, focus]);

  /** Il TSV del blocco selezionato, riga per riga come si vede. */
  const testoSelezione = useCallback((): string => {
    if (!selezione) return '';
    const n = normalizzaIntervallo(selezione);
    const indici: number[] = [];
    for (let r = n.da.riga; r <= n.a.riga; r++) indici.push(r);
    const colonneSel = colonneRef.current.slice(n.da.colonna, n.a.colonna + 1);
    // `testoRighe` vuole chiavi di colonna; qui le colonne sono posizioni, e la chiave è l'indice.
    return testoRighe(
      indici,
      colonneSel.map((_, i) => String(n.da.colonna + i)),
      (riga, colonna) => valoreRef.current(riga, Number(colonna)),
    );
  }, [selezione]);

  useEffect(() => {
    if (!attivo || !focus) return;

    const tasti = (e: KeyboardEvent) => {
      // Le frecce dentro un campo di testo muovono il cursore di scrittura, non quello di cella.
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const dirs: Record<string, 'su' | 'giu' | 'sinistra' | 'destra'> = {
        ArrowUp: 'su', ArrowDown: 'giu', ArrowLeft: 'sinistra', ArrowRight: 'destra',
      };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        const nuovo = spostaFocus(focus, dir, limiti);
        setFocus(nuovo);
        // Shift estende dall'ancora, come in Excel.
        setSelezione((s) => (e.shiftKey && s ? { da: s.da, a: nuovo } : { da: nuovo, a: nuovo }));
        return;
      }
      // Ctrl/Cmd+A prende tutta la tabella: su una griglia di sola lettura è il gesto ovvio
      // per «portami via tutto quello che vedo», e senza selezionava il testo della pagina.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelezione({
          da: { riga: 0, colonna: 0 },
          a: { riga: Math.max(limiti.righe - 1, 0), colonna: Math.max(limiti.colonne - 1, 0) },
        });
        return;
      }
      if (e.key === 'Escape') { setFocus(null); setSelezione(null); }
    };

    const copia = (e: ClipboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const testo = testoSelezione();
      if (!testo) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', testo);
    };

    window.addEventListener('keydown', tasti);
    window.addEventListener('copy', copia);
    return () => {
      window.removeEventListener('keydown', tasti);
      window.removeEventListener('copy', copia);
    };
  }, [attivo, focus, limiti, testoSelezione]);

  /** `true` se la cella è dentro il blocco selezionato. */
  const eSelezionata = useCallback(
    (riga: number, colonna: number): boolean => {
      if (!selezione) return false;
      const n = normalizzaIntervallo(selezione);
      return riga >= n.da.riga && riga <= n.a.riga && colonna >= n.da.colonna && colonna <= n.a.colonna;
    },
    [selezione],
  );

  /**
   * Props da spalmare sul `<td>`. Il click su un elemento interattivo (spunta, tendina di stato,
   * editor di una nota) NON sposta il cursore: quel click è già il comando di qualcun altro, e
   * rubarglielo significherebbe rendere la tabella copiabile al prezzo di renderla inusabile.
   */
  const propsCella = useCallback(
    (riga: number, colonna: number) => ({
      onMouseDown: (e: MouseEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest?.(INTERATTIVI)) return;
        const cella = { riga, colonna };
        if (e.shiftKey && selezione) {
          e.preventDefault(); // niente selezione-testo del browser mentre si estende il blocco
          setFocus(cella);
          setSelezione((s) => (s ? { da: s.da, a: cella } : { da: cella, a: cella }));
          return;
        }
        setFocus(cella);
        setSelezione({ da: cella, a: cella });
      },
      'data-cella-selezionata': eSelezionata(riga, colonna) ? '' : undefined,
    }),
    [eSelezionata, selezione],
  );

  /** Quante celle sono selezionate: serve al suggerimento «Ctrl+C per copiare». */
  const celleSelezionate = useMemo(
    () => (selezione ? celleDi(selezione).length : 0),
    [selezione],
  );

  /**
   * Le classi della cella: STESSA grammatica del registro ordini — fondo tenue sul blocco,
   * contorno pieno sul cursore. Sta qui e non nelle tabelle perché tre copie di due classi
   * divergono al primo ritocco, e una selezione che si vede diversa da una vista all'altra
   * è peggio di una selezione che non si vede.
   */
  const classeCella = useCallback(
    (riga: number, colonna: number): string => {
      const dentro = eSelezionata(riga, colonna);
      const cursore = focus?.riga === riga && focus?.colonna === colonna;
      if (cursore) return 'outline outline-2 -outline-offset-2 outline-[var(--brand-primary)]';
      return dentro ? 'bg-[var(--brand-primary-soft)]' : '';
    },
    [eSelezionata, focus],
  );

  return {
    focus, selezione, eSelezionata, propsCella, testoSelezione, celleSelezionate, classeCella,
  };
}
