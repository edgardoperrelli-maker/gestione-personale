'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_ASSISTENZA_KEY = 'assistenza-v1';

/**
 * Avviso "novità": il modulo Assistenza. Il back office vede in diretta il rapportino
 * dell'operatore (sola lettura) e lo guida con suggerimenti, previa accettazione.
 * Riapribile dal centro Novità in toolbar e mostrato al primo accesso al modulo.
 */
export default function AnnuncioAssistenza({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Portal su <body>: il TopBar ha backdrop-blur (stacking context) e intrappolerebbe il fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-6"
      style={{ background: 'var(--overlay)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-assistenza-title"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--brand-border)] px-5 py-4">
          <div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
            >
              ✨ Novità
            </span>
            <h2 id="annuncio-assistenza-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Assistenza: vedi il rapportino dell&apos;operatore in diretta
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
              {'Quando un operatore ha un problema sull’app, non serve più farselo raccontare al telefono: guardi la sua schermata dal back office — in sola lettura, previa sua accettazione — e lo guidi passo passo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-text-muted)]"
            title="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Principio label="Cosa vedi" title="Il rapportino vero">
              {'La schermata dell’operatore ricostruita fedelmente: dati compilati, esiti, errori e avvisi, mentre lavora. Sola lettura: guardi, non tocchi.'}
            </Principio>
            <Principio label="Consenso" title="Sempre previa accettazione">
              {'La sessione parte solo se l’operatore accetta (o la chiede lui). Può oscurare i dati sensibili e interrompere quando vuole.'}
            </Principio>
            <Principio label="In parallelo" title="Multi-sessione">
              {'Puoi assistere più operatori contemporaneamente: una scheda per ciascuno, ognuna col suo stato.'}
            </Principio>
          </div>

          <section>
            <SezioneTitolo>Come parte una sessione (due strade)</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Dall’operatore">
                {'sul suo rapportino tocca il salvagente 🛟 in basso a sinistra → “Chiedi assistenza”. La richiesta ti compare qui in alto, in “Richieste in arrivo”: premi Apri.'}
              </Voce>
              <Voce t="Dal back office">
                {'in “Rapportini di oggi” scegli l’operatore dal filtro (o cercalo per nome) e premi Assisti: sul suo telefono appare la richiesta con Accetto/Rifiuto.'}
              </Voce>
            </ul>
          </section>

          <section>
            <SezioneTitolo>Durante la sessione</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Guida con i suggerimenti">
                {'scrivi nel campo in basso alla scheda: all’operatore compare un messaggio sul telefono.'}
              </Voce>
              <Voce t="Spie di stato">
                {'“operatore in linea” e il contatore “eventi” dicono se la connessione è viva; se l’operatore interrompe, la scheda si svuota.'}
              </Voce>
              <Voce t="Limiti onesti">
                {'vedi solo l’app gp (non altre schermate del telefono); mappe e anteprima fotocamera non si replicano. Non è controllo remoto: è vista + guida.'}
              </Voce>
            </ul>
          </section>

          <section>
            <SezioneTitolo>Privacy e tracciabilità</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Niente salvataggi">
                {'la sessione è effimera: nulla del rapportino viene registrato o scritto sul database.'}
              </Voce>
              <Voce t="Audit">
                {'di ogni sessione resta traccia di chi ha assistito chi e quando (mai i contenuti).'}
              </Voce>
            </ul>
          </section>
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

function Principio({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-primary)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--brand-text-main)]">{title}</div>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--brand-text-muted)]">{children}</p>
    </div>
  );
}

function SezioneTitolo({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-text-muted)]">{children}</div>;
}

function Voce({ t, children }: { t: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }} />
      <span>
        <b className="text-[var(--brand-text-main)]">{t}</b>: {children}
      </span>
    </li>
  );
}
