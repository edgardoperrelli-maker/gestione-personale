'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_CONSUNTIVAZIONE_KEY = 'consuntivazione-v1';

/**
 * Avviso "novità": il modulo Consuntivazione. Il back office carica ed esita interventi come se
 * fossero chiusi dal rapportino di un operatore, con azioni e foto, assegnandoli a uno o più
 * operatori. Riapribile dal tasto "Novità" in toolbar e mostrato al primo accesso al modulo.
 */
export default function AnnuncioConsuntivazione({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Portal su <body>: il TopBar ha backdrop-blur (stacking context) e intrappolerebbe il fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-consuntivazione-title"
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
            <h2 id="annuncio-consuntivazione-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Consuntivazione: esita gli ordini dal back office
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
              {'Chiudi un intervento dall’ufficio come se lo esitasse un operatore dal rapportino — con le sue azioni e foto — e assegna l’esecuzione a uno o più operatori.'}
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
            <Principio label="Come si entra" title="Due fogliette">
              {'“Nuovo ordine” crea un ordine da zero e lo chiude; “Ordine presente” trova ed esita un intervento rimasto aperto dai rapportini.'}
            </Principio>
            <Principio label="Come l’operatore" title="Stesse azioni e foto">
              {'Compili le azioni del flusso del gruppo attività e carichi le foto obbligatorie; l’esito (positivo/negativo) si calcola come dal rapportino.'}
            </Principio>
            <Principio label="A valle" title="Tutto torna">
              {'L’ordine confluisce in Storico, Misuratori, Produzione economica, Performance e premialità, identico a uno chiuso sul campo.'}
            </Principio>
          </div>

          <section>
            <SezioneTitolo>Ordine presente: prima cerchi, poi esiti</SezioneTitolo>
            <p className="mb-2 text-[13px] text-[var(--brand-text-muted)]">
              {'La foglietta non mostra nulla in automatico: gli ordini da esitare compaiono solo dopo una ricerca, che puoi affinare con uno o più filtri.'}
            </p>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Committente · Gruppo attività · Descrizione attività">{'a cascata, per restringere alla lavorazione giusta.'}</Voce>
              <Voce t="Operatore">{'chi aveva in carico l’ordine.'}</Voce>
              <Voce t="Range temporale (Dal – Al)">{'la finestra del giorno lavori.'}</Voce>
              <Voce t="ODL/ODS · PDR/impianto · Via">{'per arrivare dritto all’ordine.'}</Voce>
            </ul>
          </section>

          <section>
            <SezioneTitolo>La squadra</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Uno o più operatori">
                {'assegni l’esecuzione a una squadra (binaria o multipla): il primario porta il valore economico UNA volta, tutta la squadra risulta tra gli esecutori in Performance operatori.'}
              </Voce>
              <Voce t="Tracciabilità">
                {'ogni ordine consuntivato resta marcato con chi l’ha chiuso e quando, pur contando a valle come uno esitato dall’operatore.'}
              </Voce>
            </ul>
          </section>

          <section>
            <SezioneTitolo>Quando usarlo</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Lavori chiusi fuori dal rapportino">
                {'quando un intervento è stato eseguito ma non esitato dall’app: lo chiudi tu dall’ufficio, con esito, foto e squadra.'}
              </Voce>
              <Voce t="Un ODL resta unico">
                {'se l’ODL ha già un esito positivo altrove l’ordine non fa un doppione: viene messo in riconciliazione, come nel flusso operatore.'}
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
