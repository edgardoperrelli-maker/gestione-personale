'use client';

import { Sparkles } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_CONSUNTIVAZIONE_KEY = 'consuntivazione-v1';

/**
 * Avviso "novità": il modulo Consuntivazione. Il back office carica ed esita interventi come se
 * fossero chiusi dal rapportino di un operatore, con azioni e foto, assegnandoli a uno o più
 * operatori. Riapribile dal tasto "Novità" in toolbar e mostrato al primo accesso al modulo.
 *
 * Sta sul primitivo `Dialog` (focus-trap, ESC, overlay dal token) invece di un overlay
 * `createPortal` + `fixed inset-0` fatto a mano: allineamento al sistema Cockpit.
 */
export default function AnnuncioConsuntivazione({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Consuntivazione: esita gli ordini dal back office"
      className="sm:max-w-3xl"
      footer={<Button variant="primary" onClick={onClose} size="sm">Ho capito</Button>}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--primary-text)' }}
          >
            <Sparkles size={11} aria-hidden /> Novità
          </span>
          <p className="max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
            {'Chiudi un intervento dall’ufficio come se lo esitasse un operatore dal rapportino — con le sue azioni e foto — e assegna l’esecuzione a uno o più operatori.'}
          </p>
        </div>

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
    </Dialog>
  );
}

function Principio({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary-text)]">{label}</div>
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
