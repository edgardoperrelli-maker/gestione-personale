'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_SQUADRE_KEY = 'crono-squadre-v1';

type Terr = { bg: string; bd: string; tx: string; band: string };
const NAPOLI: Terr = { bg: 'rgba(232,121,249,0.16)', bd: 'rgba(232,121,249,0.40)', tx: '#F0ABFC', band: '#E879F9' };
const LAZIO_EST: Terr = { bg: 'rgba(56,189,248,0.16)', bd: 'rgba(56,189,248,0.40)', tx: '#7DD3FC', band: '#38BDF8' };
const AURELIA: Terr = { bg: 'rgba(74,222,128,0.16)', bd: 'rgba(74,222,128,0.40)', tx: '#86EFAC', band: '#4ADE80' };

type Membro = { nome: string; capo?: boolean; rep?: boolean; assente?: boolean };

/**
 * Avviso "novità" / tutorial mostrato al primo accesso al Cronoprogramma (una volta per utente, via
 * DB). È anche il tutorial completo, riapribile dal tasto "Novità" in toolbar: spiega la funzione
 * Squadre con principi, esempi (da 2 a 4 · resine), casi limite e comportamento del gesto.
 */
export default function AnnuncioSquadre({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Il modale va reso in un portal su <body>: il TopBar che ospita il tasto "Novità" ha
  // `backdrop-blur`, che crea uno stacking context e diventa il blocco contenitore dei figli
  // `position: fixed`. Renderizzato lì dentro, il modale (z-[70]) resta intrappolato al livello
  // dell'header (z-40) e finisce SOTTO il cronoprogramma. Il portal lo sposta fuori, così la sua
  // z-index copre davvero l'intera pagina. `mounted` evita l'accesso a `document` durante l'SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-squadre-title"
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
            <h2 id="annuncio-squadre-title" className="mt-2 text-xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Squadre nel Cronoprogramma
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--brand-text-muted)]">
              {"Ora puoi legare più operatori che lavorano insieme come squadra (da 2 a 4 e oltre), direttamente sulla griglia. Stesso gesto: trascini una card sull'occhiello ⛓ di un'altra e le agganci."}
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

        {/* Body scrollabile */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Principi */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Principio label="Regola" title="2 … N membri">
              {"Nessun tetto rigido. Aggancia un altro operatore e la squadra passa da 2→3→4. Trascini un membro fuori e la squadra si riduce."}
            </Principio>
            <Principio label="Guida morbida" title="Dimensione consigliata">
              <>
                <b className="text-[var(--brand-text-main)]">RESINE → 4</b>. La card mostra un progresso <b className="text-[var(--brand-text-main)]">4/4</b> e avvisa se è sotto (es. 3/4), ma non ti blocca: resta un suggerimento.
              </>
            </Principio>
            <Principio label="Un colore, un legame" title="Territorio + catena blu">
              {"La banda resta il colore del territorio. La catena e il badge SQUADRA ×N sono blu: il legame non collide con nessun territorio."}
            </Principio>
          </div>

          {/* Squadra da 4 · Resine Napoli */}
          <section>
            <SezioneTitolo>Squadra da 4 · Resine Napoli</SezioneTitolo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Etichetta>Card-squadra ×4 (completa)</Etichetta>
                <SquadDemo
                  terr={NAPOLI}
                  count={4}
                  progress="Resine · 4/4"
                  membri={[
                    { nome: 'Esposito R.', capo: true, rep: true },
                    { nome: 'Russo A.' },
                    { nome: 'Greco M.' },
                    { nome: 'Gallo V.' },
                  ]}
                  meta="Napoli | Resine | CC-04"
                />
              </div>
              <div>
                <Etichetta>Aggancio del 4° membro (drag)</Etichetta>
                <div
                  className="mb-1 rounded-lg border px-2 py-1.5 text-[11px]"
                  style={{ backgroundColor: NAPOLI.bg, borderColor: NAPOLI.bd, color: NAPOLI.tx, transform: 'rotate(-1.5deg)', opacity: 0.75 }}
                >
                  <span className="font-semibold uppercase tracking-tight">Gallo V.</span>
                  <span className="ml-1 opacity-70">· ⛓</span>
                </div>
                <div className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-primary)' }}>
                  ⛓ Aggiungi a squadra → 4/4
                </div>
                <SquadDemo
                  terr={NAPOLI}
                  count={3}
                  progress="Resine · 3/4"
                  progressWarn
                  membri={[{ nome: 'Esposito R.', capo: true }, { nome: 'Russo A.' }, { nome: 'Greco M.' }]}
                  meta="Napoli | Resine"
                />
              </div>
            </div>
            <div
              className="mt-3 rounded-xl border px-4 py-2.5 text-sm"
              style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
            >
              Aggiunto Gallo V. alla squadra Resine · Napoli — VEN 17 · ora 4/4
            </div>
          </section>

          {/* Scala 2/3/4 + incompleta */}
          <section>
            <SezioneTitolo>Scala con il lavoro · 2, 3, 4 — e squadra incompleta</SezioneTitolo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Etichetta>×2 · Sopralluogo</Etichetta>
                <SquadDemo terr={LAZIO_EST} count={2} membri={[{ nome: 'Marino G.', capo: true }, { nome: 'Costa D.' }]} meta="Lazio Est | Sopralluogo" />
              </div>
              <div>
                <Etichetta>×3 · Posa</Etichetta>
                <SquadDemo terr={AURELIA} count={3} membri={[{ nome: 'Conti B.', capo: true }, { nome: 'Fabbri L.', rep: true }, { nome: 'Sala E.' }]} meta="Aurelia | Posa" />
              </div>
              <div>
                <Etichetta>×4 incompleta · un assente</Etichetta>
                <SquadDemo
                  terr={NAPOLI}
                  count={4}
                  progress="3/4 presenti"
                  progressWarn
                  membri={[{ nome: 'Esposito R.', capo: true }, { nome: 'Russo A.' }, { nome: 'Greco M.' }, { nome: 'De Luca F.', assente: true }]}
                  meta="Napoli | Resine"
                  incompleta="Squadra incompleta — De Luca in ferie"
                />
              </div>
            </div>
          </section>

          {/* Comportamento del gesto */}
          <section>
            <SezioneTitolo>Comportamento del gesto</SezioneTitolo>
            <ul className="space-y-1.5 text-[13px] text-[var(--brand-text-muted)]">
              <Voce t="Aggiungi">{"trascini una card operatore sull'occhiello ⛓ di un'altra card, o sopra una squadra → diventa un nuovo membro (la catena si allunga)."}</Voce>
              <Voce t="Togli">{"trascini una riga-membro fuori dalla squadra, oppure il piccolo ✕ che appare in hover sulla riga. Se resta 1 solo, la squadra si scioglie e torna card singola."}</Voce>
              <Voce t="Capo squadra">{"il ★ indica il capo; clicca la stella di un altro membro per cambiarlo. Uno per squadra."}</Voce>
              <Voce t="Vincoli">{"stesso giorno + territorio (la squadra vive in una cella). Un membro in assenza intera resta barrato con \"x/N presenti\"."}</Voce>
              <Voce t="Dimensione consigliata">{"legata all'attività (RESINE → 4). Guida il progresso x/N e l'avviso \"sotto organico\", senza mai bloccare."}</Voce>
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

function Etichetta({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">{children}</div>;
}

function Voce({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }} />
      <span>
        <b className="text-[var(--brand-text-main)]">{t}</b>: {children}
      </span>
    </li>
  );
}

function SquadDemo({
  terr,
  count,
  progress,
  progressWarn,
  membri,
  meta,
  incompleta,
}: {
  terr: Terr;
  count: number;
  progress?: string;
  progressWarn?: boolean;
  membri: Membro[];
  meta: string;
  incompleta?: string;
}) {
  return (
    <div
      className="relative rounded-lg border px-2 pb-2 pt-1.5 text-[11px]"
      style={{ backgroundColor: terr.bg, borderColor: terr.bd, color: terr.tx, outline: '1px solid var(--brand-primary-border)' }}
    >
      <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ backgroundColor: terr.band }} />
      <div className="mb-1 flex items-center justify-between gap-2 pl-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
        >
          ⛓ Squadra ×{count}
        </span>
        {progress && (
          <span
            className="rounded-full px-1.5 py-px text-[9px] font-semibold"
            style={progressWarn ? { color: 'var(--warning)', border: '1px solid var(--warning)' } : { color: terr.tx, border: `1px solid ${terr.bd}` }}
          >
            {progress}
          </span>
        )}
      </div>
      <div className="relative pl-4">
        <span className="absolute bottom-1 left-1.5 top-1 w-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', opacity: 0.85 }} />
        {membri.map((m) => (
          <div key={m.nome} className="relative flex items-center gap-1.5 py-0.5">
            <span className="absolute -left-[11px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', boxShadow: `0 0 0 2px ${terr.bg}` }} />
            {m.capo && (
              <span className="rounded px-1 text-[8.5px] font-bold" style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}>
                CAPO
              </span>
            )}
            {m.rep && (
              <span className="rounded px-1 text-[8.5px] font-bold" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                REP
              </span>
            )}
            <span className={`font-semibold uppercase tracking-tight ${m.assente ? 'line-through opacity-50' : ''}`}>{m.nome}</span>
            {m.assente && (
              <span className="rounded px-1 text-[8.5px] font-bold" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }}>
                FERIE
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 pl-1.5 text-[10px] opacity-75">{meta}</div>
      {incompleta && (
        <div className="mx-1 mt-1 rounded-md px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }}>
          {incompleta}
        </div>
      )}
    </div>
  );
}
