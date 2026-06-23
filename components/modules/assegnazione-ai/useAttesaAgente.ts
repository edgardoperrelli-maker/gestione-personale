'use client';

import { useEffect, useRef } from 'react';

/** Polling finché l'azione dell'agente è IN ATTESA e non ancora completata.
 *  Richiama `onPoll` ogni `intervalloMs`; si ferma quando `fatto` o `!inAttesa` (o all'unmount).
 *  `onPoll` è tenuto in un ref → cambiarlo non resetta l'intervallo. */
export function useAttesaAgente({
  inAttesa,
  fatto,
  onPoll,
  intervalloMs = 6000,
}: {
  inAttesa: boolean;
  fatto: boolean;
  onPoll: () => void;
  intervalloMs?: number;
}) {
  const cb = useRef(onPoll);
  cb.current = onPoll;

  useEffect(() => {
    if (!inAttesa || fatto) return;
    const id = setInterval(() => cb.current(), intervalloMs);
    return () => clearInterval(id);
  }, [inAttesa, fatto, intervalloMs]);
}
