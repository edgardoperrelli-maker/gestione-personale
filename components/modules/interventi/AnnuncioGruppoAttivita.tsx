'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_GRUPPO_ATTIVITA_KEY = 'gruppo-attivita-v1';

/**
 * Avviso "novità": il motore Gruppo attività (tassonomia unica). Ogni attività ha una
 * descrizione ufficiale e un Gruppo; import in pianificazione con validazione a lista
 * chiusa, template Excel dal server, select obbligatoria per gli interventi manuali.
 * Riapribile dal tasto "Novità" in toolbar.
 */
export default function AnnuncioGruppoAttivita({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Portal su <body>: il TopBar ha backdrop-blur (stacking context) e intrappolerebbe il fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-gruppo-attivita-title"
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
            <h2 id="annuncio-gruppo-attivita-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Motore Gruppo attività: una tassonomia unica
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
              {'Ogni attività ora ha una descrizione UFFICIALE e appartiene a un Gruppo (DUNNING, LIMITAZIONI MASSIVE, …). Niente più varianti scritte a mano: i dati entrano puliti e tutti i moduli parlano la stessa lingua.'}
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
            <Principio label="La base" title="Lista ufficiale">
              {'Le descrizioni attività valide vivono in un’unica tabella di tassonomia: ognuna con il suo Gruppo. Aggiungere un’attività lì la rende valida ovunque, senza deploy.'}
            </Principio>
            <Principio label="Sui dati" title="Gruppo su ogni intervento">
              {'Ogni intervento porta il suo Gruppo attività (anche lo storico, riclassificato in automatico): lo vedi nel modulo Interventi e alimenta i controlli, come il confronto esiti Dunning.'}
            </Principio>
            <Principio label="In pianificazione" title="Derivazione automatica">
              {'Quando carichi i lavori, gruppo e descrizione canonica si derivano da soli dall’attività del file: nessun passaggio in più per l’ufficio.'}
            </Principio>
          </div>

          <section>
            <SezioneTitolo>Guardrail sull&rsquo;import</SezioneTitolo>
            <div
              className="mb-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              ✕ Import rifiutato — 3 attività non riconosciute (riga 12, 27, 41): correggile nel file e ricarica.
            </div>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="File con colonna attività">
                {'i valori devono essere della lista ufficiale: se anche una riga è sbagliata l’import si ferma e una modale elenca esattamente cosa correggere.'}
              </Voce>
              <Voce t="File senza colonna (legacy)">
                {'continuano a entrare come prima, con controllo morbido: niente blocchi sul pregresso.'}
              </Voce>
              <Voce t="Template Excel dal server">
                {'il modello scaricabile ha due fogli: i dati e la Leggenda con le attività valide (il gruppo si compila da solo con una formula).'}
              </Voce>
            </ul>
          </section>

          <section>
            <SezioneTitolo>Interventi manuali</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Attività a lista chiusa">
                {'sul "+" dell’operatore e su ogni altro percorso di creazione manuale l’attività si sceglie da un menù, non si scrive più a mano libera.'}
              </Voce>
              <Voce t="Perché conta">
                {'un’attività scritta in modo diverso finiva classificata male (o per niente): ora il dato nasce giusto e i conteggi per gruppo tornano sempre.'}
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
