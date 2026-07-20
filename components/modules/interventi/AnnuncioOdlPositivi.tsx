'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_ODL_POSITIVI_KEY = 'odl-positivi-v1';

/**
 * Avviso "novità": la regola anti doppio esito. Un ODL eseguito POSITIVO è definitivamente
 * chiuso — non può essere ripianificato né esitato di nuovo (nemmeno come negativo); dopo un
 * esito negativo la riassegnazione resta permessa. Spiega dove l'app avvisa e cosa succede
 * ai doppioni. Riapribile dal tasto "Novità" in toolbar.
 */
export default function AnnuncioOdlPositivi({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Portal su <body>: il TopBar ha backdrop-blur (stacking context) e intrappolerebbe il fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-odl-positivi-title"
      onClick={onClose}
    >
      <div
        className="my-auto flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-2xl"
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
            <h2 id="annuncio-odl-positivi-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Stop ai doppi esiti: un ODL positivo si chiude per sempre
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
              {'Un ordine eseguito POSITIVO non può più essere riassegnato né esitato una seconda volta — nemmeno come negativo. Dopo un esito negativo, invece, la rilavorazione resta permessa come sempre.'}
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
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Principio label="La regola" title="Positivo = chiuso">
              {'Se un ODL risulta già eseguito positivo (intervento chiuso o voce rapportino SI), non rientra più in pianificazione: niente nuovo intervento, niente voce nel rapportino.'}
            </Principio>
            <Principio label="Eccezione" title="Il negativo si rilavora">
              {'"Nessun passaggio", accesso negato, rinvio: l’ordine può essere riassegnato nei giorni successivi, esattamente come prima.'}
            </Principio>
            <Principio label="Garanzia" title="Anche il database dice no">
              {'Oltre ai controlli dell’app, il database rifiuta fisicamente un secondo esito positivo sullo stesso ODL: il doppione non può esistere.'}
            </Principio>
          </div>

          <section>
            <SezioneTitolo>Dove ti avvisa</SezioneTitolo>
            <div className="space-y-2">
              <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                ⛔ 2 ODL già eseguiti positivi — non affidabili, al salvataggio verranno esclusi da rapportini e torre: 9573…, 9573…
              </div>
              <p className="text-[12.5px] leading-snug text-[var(--brand-text-muted)]">
                In <b className="text-[var(--brand-text-main)]">Pianificazione</b> il banner rosso compare appena carichi i lavori, prima ancora di salvare.
                Al <b className="text-[var(--brand-text-main)]">salvataggio</b> l&rsquo;avviso &ldquo;Torre: N interventi generati&rdquo; elenca gli ODL esclusi.
                In <b className="text-[var(--brand-text-main)]">Assegnazione AI</b> gli esclusi compaiono tra gli avvisi a fine assegnazione.
              </p>
            </div>
          </section>

          <section>
            <SezioneTitolo>Cosa succede ai doppioni</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Secondo &ldquo;Fatto&rdquo; sullo stesso ODL">
                {'l’intervento viene annullato come DOPPIO POSITIVO con riferimento all’originale e finisce nella lista di riconciliazione. L’operatore non viene mai bloccato sul campo.'}
              </Voce>
              <Voce t="Negativo dopo un positivo">
                {'la chiusura resta registrata ma viene marcata da riconciliare: la visita non era dovuta.'}
              </Voce>
              <Voce t="Doppioni storici">
                {'i casi passati sono già stati bonificati in automatico: li trovi nella lista di riconciliazione con la motivazione e la data del positivo valido.'}
              </Voce>
              <Voce t="Stesso ODL due volte nel piano">
                {'per esempio da import file + caricamento template: la voce nasce una sola volta, il doppione interno sparisce da solo.'}
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
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--brand-primary)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--brand-text-main)]">{title}</div>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--brand-text-muted)]">{children}</p>
    </div>
  );
}

function SezioneTitolo({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--brand-text-muted)]">{children}</div>;
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
