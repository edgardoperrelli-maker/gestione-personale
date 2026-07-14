'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_SEGNALAZIONE_KEY = 'segnalazione-v1';

/** Il megafono, identico all'icona del FAB (components/segnalazione/SegnalaButton). */
function Megafono({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l16-5v12L3 13v-2z" />
      <path d="M8 13v4a2 2 0 002 2h1" />
      <path d="M19 8a3 3 0 010 6" />
    </svg>
  );
}

/**
 * Avviso "novità" / tutorial della funzione Segnalazioni. Mostrato al primo accesso (una volta per
 * utente, via /api/annunci → tabella annunci_visti) da AppShell, e riapribile dal tasto "Novità"
 * (NovitaCenter). Spiega il pulsante megafono in basso a destra: manda bug/idee dritte ad ATLAS.
 */
export default function AnnuncioSegnalazione({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Reso in un portal su <body>: fuori da qualsiasi contenitore con backdrop-blur/transform, così la
  // sua z-index copre l'intera pagina (stesso motivo di AnnuncioSquadre). `mounted` evita `document`
  // durante l'SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-segnalazione-title"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--brand-border)] px-5 py-4">
          <div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
            >
              ✨ Novità
            </span>
            <h2 id="annuncio-segnalazione-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Segnala bug e idee, in un tocco
            </h2>
            <p className="mt-0.5 max-w-[58ch] text-sm text-[var(--brand-text-muted)]">
              {"Da ora, in ogni pagina trovi il pulsante megafono in basso a destra. Un bug, un dato sbagliato o un'idea per migliorare? Un click e lo mandi direttamente ad ATLAS — niente email, niente giri."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-text-muted)]"
            title="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Dov'è: anteprima del FAB in basso a destra */}
          <div className="relative overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--brand-text-muted)]">Dove si trova</div>
            <p className="mt-1 text-[13px] text-[var(--brand-text-muted)]">
              In basso a <b className="text-[var(--brand-text-main)]">destra</b>, il pulsante tondo con il megafono. Ti segue in ogni schermata.
            </p>
            <div className="pointer-events-none mt-3 flex justify-end">
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--on-primary)] shadow-lg ring-2 ring-[var(--brand-primary)]/30"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Megafono className="h-5 w-5" />
              </span>
            </div>
          </div>

          {/* Come si usa: 3 passi */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Passo n={1} titolo="Apri">
              Tocca il <b className="text-[var(--brand-text-main)]">megafono</b> in basso a destra.
            </Passo>
            <Passo n={2} titolo="Scrivi">
              {"Una riga su cosa succede, più eventuali dettagli."}
            </Passo>
            <Passo n={3} titolo="Invia">
              {"La segnalazione arriva ad ATLAS e viene presa in carico."}
            </Passo>
          </div>

          <p className="text-[12.5px] text-[var(--brand-text-muted)]">
            Vale per tutto: un bottone storto, un numero che non torna, un&apos;idea per rendere l&apos;app più comoda. Più ci scrivi, più l&apos;app migliora.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--brand-border)] px-5 py-4">
          <Button onClick={onClose} size="sm">
            Ho capito
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Passo({ n, titolo, children }: { n: number; titolo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3.5">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
        >
          {n}
        </span>
        <span className="text-sm font-semibold text-[var(--brand-text-main)]">{titolo}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--brand-text-muted)]">{children}</p>
    </div>
  );
}
