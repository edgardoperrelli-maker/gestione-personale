'use client';

import { Sparkles, TriangleAlert } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_GRUPPO_ATTIVITA_KEY = 'gruppo-attivita-v1';

/**
 * Avviso "novità": il motore Gruppo attività (tassonomia unica). Ogni attività ha una
 * descrizione ufficiale e un Gruppo; import in pianificazione con validazione a lista
 * chiusa, template Excel dal server, select obbligatoria per gli interventi manuali.
 * Riapribile dal tasto "Novità" in toolbar.
 *
 * Sta sul primitivo `Dialog` (focus-trap, ESC, overlay dal token) invece di un portale
 * `bg-black/40` fatto a mano, come gli altri annunci del Novità center.
 */
export default function AnnuncioGruppoAttivita({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Motore Gruppo attività: una tassonomia unica"
      className="sm:max-w-3xl"
      footer={<Button onClick={onClose} size="sm">Ho capito</Button>}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--primary-text)' }}
          >
            <Sparkles size={11} aria-hidden /> Novità
          </span>
          <p className="max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
            {'Ogni attività ora ha una descrizione UFFICIALE e appartiene a un Gruppo (DUNNING, LIMITAZIONI MASSIVE, …). Niente più varianti scritte a mano: i dati entrano puliti e tutti i moduli parlano la stessa lingua.'}
          </p>
        </div>

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
            className="mb-2 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>Import rifiutato — 3 attività non riconosciute (riga 12, 27, 41): correggile nel file e ricarica.</span>
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
    </Dialog>
  );
}

function Principio({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--primary-text)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--brand-text-main)]">{title}</div>
      <p className="mt-1 text-xs leading-snug text-[var(--brand-text-muted)]">{children}</p>
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
