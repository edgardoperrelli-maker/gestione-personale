'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DefColonna } from '@/lib/acea/colonneTabella';
import {
  LAYOUT_VUOTO, chiaveLayout, leggiLayout, limitaLarghezza, ordinaColonne, scriviLayout,
  spostaColonna, spostaDi, type LayoutTabella,
} from '@/lib/acea/layoutTabella';

/**
 * Ordine e larghezze delle colonne, come li ha sistemati l'utente, salvati nel suo browser.
 *
 * Nel browser e non sul server di proposito: è una preferenza di postazione, non un dato della
 * commessa. Chi pianifica lo fa dal suo schermo, e un ordine salvato sul profilo lo seguirebbe su
 * un monitor di forma diversa dove non ha senso. Se un domani servisse condiviso, il pezzo da
 * spostare è solo questo file — la logica pura vive in `lib/acea/layoutTabella.ts`.
 */
export function useLayoutTabella(famiglia: string, colonne: DefColonna[]) {
  const [layout, setLayout] = useState<LayoutTabella>(LAYOUT_VUOTO);
  const chiave = chiaveLayout(famiglia);
  const chiaviValide = useMemo(() => new Set(colonne.map((c) => c.chiave)), [colonne]);

  /*
    Letto DOPO il montaggio, non nell'inizializzatore di `useState`: `localStorage` non esiste sul
    server, e un primo render diverso fra server e client è un errore di idratazione — React
    scarterebbe il markup e ridisegnerebbe tutto.
  */
  useEffect(() => {
    try {
      setLayout(leggiLayout(window.localStorage.getItem(chiave), chiaviValide));
    } catch {
      /* navigazione privata o storage pieno: si lavora con l'ordine di definizione */
    }
  }, [chiave, chiaviValide]);

  const aggiorna = useCallback((f: (l: LayoutTabella) => LayoutTabella) => {
    setLayout((prec) => {
      const agg = f(prec);
      try {
        window.localStorage.setItem(chiave, scriviLayout(agg));
      } catch {
        /* non si salva, ma la sessione corrente resta com'è stata sistemata */
      }
      return agg;
    });
  }, [chiave]);

  /** Colonne nell'ordine scelto. Fonte di verità su COSA esiste: sempre `colonne`. */
  const ordinate = useMemo(
    () => ordinaColonne(colonne, layout.ordine),
    [colonne, layout.ordine],
  );

  const larghezza = useCallback(
    (k: string) => layout.larghezze[k] ?? colonne.find((c) => c.chiave === k)?.larghezza ?? 120,
    [layout.larghezze, colonne],
  );

  const personalizzata = useCallback((k: string) => k in layout.larghezze, [layout.larghezze]);

  const onLarghezza = useCallback((k: string, px: number) => {
    aggiorna((l) => ({ ...l, larghezze: { ...l.larghezze, [k]: limitaLarghezza(px) } }));
  }, [aggiorna]);

  const onAzzeraLarghezza = useCallback((k: string) => {
    aggiorna((l) => {
      const larghezze = { ...l.larghezze };
      delete larghezze[k];
      return { ...l, larghezze };
    });
  }, [aggiorna]);

  // Si parte SEMPRE dall'ordine effettivo a schermo, non da `layout.ordine`: quello è vuoto finché
  // non si salva la prima volta, e uno spostamento su una lista vuota non sposterebbe niente.
  const chiaviOrdinate = useMemo(() => ordinate.map((c) => c.chiave), [ordinate]);

  const onSposta = useCallback((da: string, a: string) => {
    aggiorna((l) => ({ ...l, ordine: spostaColonna(chiaviOrdinate, da, a) }));
  }, [aggiorna, chiaviOrdinate]);

  const onSpostaDi = useCallback((k: string, passo: -1 | 1) => {
    aggiorna((l) => ({ ...l, ordine: spostaDi(chiaviOrdinate, k, passo) }));
  }, [aggiorna, chiaviOrdinate]);

  const azzera = useCallback(() => aggiorna(() => LAYOUT_VUOTO), [aggiorna]);

  const personalizzato =
    layout.ordine.length > 0 || Object.keys(layout.larghezze).length > 0;

  return {
    ordinate,
    personalizzato,
    azzera,
    comandi: { larghezza, personalizzata, onLarghezza, onAzzeraLarghezza, onSposta, onSpostaDi },
  };
}

export type ComandiColonne = ReturnType<typeof useLayoutTabella>['comandi'];
