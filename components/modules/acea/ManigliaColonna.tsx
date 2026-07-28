'use client';

import { useRef } from 'react';
import { LARGHEZZA_MAX, LARGHEZZA_MIN } from '@/lib/acea/layoutTabella';

type Props = {
  chiave: string;
  intestazione: string;
  larghezza: number;
  onLarghezza: (chiave: string, px: number) => void;
  onAzzera: (chiave: string) => void;
  onInizio: () => void;
  onFine: () => void;
};

/** Di quanto si muove la colonna a ogni freccia. 16px è un passo che si vede senza essere brusco. */
const PASSO = 16;

/**
 * Maniglia di ridimensionamento sul bordo destro di un'intestazione.
 *
 * `role="separator"` focalizzabile con `aria-valuenow`: è il pattern ARIA del divisore mobile, e
 * porta con sé il fatto che le frecce lo muovono. Serve perché ridimensionare col solo mouse
 * escluderebbe chi lavora da tastiera — e questa tabella si usa da tastiera per davvero, l'editing
 * di esecutore e data si fa con le frecce.
 *
 * Costa un punto di tabulazione per colonna. L'intestazione ne aveva già due (ordinamento e
 * imbuto): il terzo sta dentro la struttura che chi naviga a tastiera si aspetta da una griglia.
 *
 * `setPointerCapture` invece di listener su `window`: il trascinamento continua anche quando il
 * puntatore esce dalla maniglia — che succede sempre, visto che la maniglia è larga 6px e la mano
 * si muove di centinaia — e si chiude da sé se il puntatore viene perso (finestra che perde il
 * fuoco, gesto interrotto), senza lasciare ascoltatori appesi.
 */
export default function ManigliaColonna({
  chiave, intestazione, larghezza, onLarghezza, onAzzera, onInizio, onFine,
}: Props) {
  const partenza = useRef<{ x: number; larghezza: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Larghezza colonna ${intestazione}`}
      aria-valuenow={larghezza}
      aria-valuemin={LARGHEZZA_MIN}
      aria-valuemax={LARGHEZZA_MAX}
      aria-valuetext={`${larghezza} pixel`}
      tabIndex={0}
      // Il trascinamento HTML5 dell'intestazione (riordino) partirebbe anche da qui: senza questo
      // il browser proverebbe a spostare la colonna mentre la si allarga.
      draggable={false}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        partenza.current = { x: e.clientX, larghezza };
        onInizio();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = partenza.current;
        if (!p) return;
        onLarghezza(chiave, p.larghezza + (e.clientX - p.x));
      }}
      onPointerUp={(e) => {
        if (!partenza.current) return;
        partenza.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onFine();
      }}
      onPointerCancel={() => {
        if (!partenza.current) return;
        partenza.current = null;
        onFine();
      }}
      // Doppio click: torna alla larghezza di definizione. È l'unico modo per disfare un
      // ridimensionamento senza azzerare tutta la tabella.
      onDoubleClick={() => onAzzera(chiave)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onLarghezza(chiave, larghezza - PASSO); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onLarghezza(chiave, larghezza + PASSO); }
        else if (e.key === 'Home' || e.key === 'Backspace') { e.preventDefault(); onAzzera(chiave); }
      }}
      // Niente `title`: su un elemento che ha già `aria-label` fa annunciare due volte la stessa
      // cosa, e col fuoco da tastiera non compare comunque. L'affordanza qui è il cursore.
      className="absolute right-0 top-1 bottom-1 z-10 w-1.5 shrink-0 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-[var(--brand-primary)] focus:outline-none focus-visible:bg-[var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
    />
  );
}
