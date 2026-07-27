'use client';

import { Sparkles } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';
import StatTile from '@/components/ui/StatTile';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_CONFRONTO_ESITI_KEY = 'confronto-esiti-acea-v1';

/**
 * Avviso "novità": il pannello "Controllo esiti DB ↔ ACEA" nella foglia Aggiorna stato ODL
 * (Assegnazione AI → ACEA). Verifica incrociata dei positivi con doppia conferma per riga,
 * solo gruppo Dunning, finestra corrente + storico, export Excel. Riapribile dal tasto "Novità".
 *
 * Sta sul primitivo `Dialog` (focus-trap, ESC, overlay dal token) invece di un overlay
 * `bg-black/40` fatto a mano: era l'unica modale del modulo ancora ad-hoc.
 */
export default function AnnuncioConfrontoEsiti({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Controllo esiti DB ↔ ACEA"
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
            {'In Assegnazione AI → ACEA → Aggiorna stato ODL c’è una nuova card che confronta i nostri esiti positivi con quello che risulta sul portale ACEA — nelle due direzioni.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Principio label="Doppia conferma" title="Ogni riga, due esiti">
            {'Per ogni ODL vedi affiancati l’esito nel nostro DB (con la fonte: intervento chiuso, rapportino o entrambi) e l’esito su ACEA (stato + causale di scostamento).'}
          </Principio>
          <Principio label="Ambito" title="Solo gruppo Dunning">
            {'Il confronto verifica solo i lavori del gruppo attività Dunning: limitazioni massive e ordini ancora da creare (senza ODS) restano fuori, niente falsi allarmi.'}
          </Principio>
          <Principio label="Quando" title="Si calcola quando apri">
            {'La card è chiusa di default: si apre con un clic, calcola al volo e si aggiorna da sola quando l’agente completa un giro. Nessun dato salvato: è sempre la foto attuale.'}
          </Principio>
        </div>

        <section>
          <SezioneTitolo>I contatori</SezioneTitolo>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TileDemo label="Doppia conferma OK" value="934" tono="ok" />
            <TileDemo label="Non esitati su ACEA" value="2" tono="danger" />
            <TileDemo label="A nostro carico" value="1" tono="warn" />
            <TileDemo label="ACEA ok, manca nel DB" value="1" tono="danger" />
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
            <Voce t="Doppia conferma OK">{'positivo da noi e COMPLETATO su ACEA con causale remunerata (E…): tutto allineato.'}</Voce>
            <Voce t="Non esitato su ACEA">{'da noi è positivo ma il portale non lo dà ancora eseguito: da riportare su ACEA.'}</Voce>
            <Voce t="A nostro carico">{'ACEA lo dà chiuso ma con causale non pagata (NMNT, NPRT…): lavoro non remunerato, da chiarire.'}</Voce>
            <Voce t="ACEA ok, manca nel DB">{'il portale lo dà eseguito e pagabile, ma da noi risulta negativo o aperto: manca la registrazione.'}</Voce>
          </ul>
        </section>

        <section>
          <SezioneTitolo>Strumenti</SezioneTitolo>
          <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
            <Voce t="Finestra">{'di default gli ultimi 60 giorni (la stessa finestra dell’agente); con la spunta "Tutto lo storico" analizzi ogni positivo di sempre.'}</Voce>
            <Voce t="Esporta Excel">{'tre fogli con gli elenchi completi: disallineati, mancanti nel DB e ODL mai comparsi nell’app.'}</Voce>
            <Voce t="Dati ACEA al…">{'l’intestazione dice sempre a quando risale l’ultimo export del portale: per aggiornarlo basta "Esegui ora" qui sopra.'}</Voce>
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

// Adapter al primitivo StatTile (tessera demo dei contatori nell'annuncio Novità).
function TileDemo({ label, value, tono }: { label: string; value: string; tono: 'ok' | 'warn' | 'danger' }) {
  return <StatTile label={label} value={value} tone={tono} size="sm" />;
}
