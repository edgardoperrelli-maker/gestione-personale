/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useState } from 'react';
import { AlertTriangle, Ban, Check, ChevronRight, Clock, StickyNote, X } from 'lucide-react';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import type { RiepilogoRapportino, StatoVoce } from '@/utils/rapportini/riepilogo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { IntestazioneRiepilogo } from './IntestazioneRiepilogo';
import { CondividiPdfButton } from './CondividiPdfButton';
import { rigaMatchRicerca } from '@/utils/rapportini/rigaMatchRicerca';
import type { MotivoIncompleto } from '@/utils/rapportini/voceMancante';

/**
 * Riga della lista. `sub` (seconda riga) e `meta` (testo accanto al titolo) sono TESTI GIÀ
 * COMPOSTI: quali campi ci finiscano lo decide il flusso in «Azioni operatori» (`lista_campi`,
 * vedi utils/rapportini/rigaLista). `matricola`/`via`/`odl` restano per la ricerca, che cerca
 * nel dato e non in ciò che è a schermo.
 */
export type RigaVoce = { index: number; titolo: string; sub: string; meta?: string; stato: StatoVoce; nuovo?: boolean; annullato?: boolean; /** Avviso "ODL già positivo il … (…)": voce bloccata, non compilabile. */ bloccoPositivo?: string; nota?: string; /** Segnalato TOP da ACEA: pill in riga, e la riga sale in cima alla lista. */ top?: boolean; notaCollega?: boolean; badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null; matricola?: string; via?: string; odl?: string };
export type Filtro = 'tutti' | 'dafare' | 'completati';

/** Chip di stato della riga: reso col primitivo Badge, toni d'intento --status-* (DESIGN.md §3). */
const CHIP: Record<StatoVoce, { label: string; variant: 'ok' | 'ko' | 'idle' }> = {
  eseguito: { label: 'Fatto', variant: 'ok' },
  non_eseguito: { label: 'Non fatto', variant: 'ko' },
  da_fare: { label: 'Da fare', variant: 'idle' },
};

/**
 * Marcatori della riga. Geometria allineata al primitivo Badge, ma il markup resta a mano:
 * Badge non ha né un variant a fondo PIENO (serve al blocco, che deve urlare più del chip)
 * né la coppia `--warning-soft` / `--brand-text-main`. Le coppie sono le stesse del banner
 * in VoceCard, che mostra lo stesso dato: se divergessero, riga e voce direbbero due cose.
 */
const PILL = 'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold';
const PILL_BLOCCO = 'bg-[var(--status-ko)] text-[var(--on-danger)]';
const PILL_ATTESA = 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]';
const PILL_RIFIUTATO = 'bg-[var(--status-ko-soft)] text-[var(--status-ko)]';
/** TOP: ambra piena, non soft — è la prima cosa che deve staccarsi scorrendo la lista. */
const PILL_TOP = 'bg-[var(--status-warn)] text-white';

const FILTRI: [Filtro, string][] = [['tutti', 'Tutti'], ['dafare', 'Da fare'], ['completati', 'Completati']];

const MOTIVO_LABEL: Record<MotivoIncompleto, string> = {
  senza_esito: 'senza esito',
  nota_mancante: 'nota obbligatoria mancante',
  // L'esito c'è: manca il numero di ciò che è stato installato. Dirgli «senza esito» lo
  // manderebbe a cercare il campo sbagliato.
  matricola_mancante: 'matricola del misuratore installato mancante',
};

export function RigaVoceCard({ riga: r, onApri }: { riga: RigaVoce; onApri: (index: number) => void }) {
  const chip = CHIP[r.stato];
  // Voce bloccata (ODL già positivo altrove): stessa resa "spenta" dell'annullato, non apribile.
  const spenta = r.annullato || Boolean(r.bloccoPositivo);
  const bordo = spenta ? 'border-l-[3px] border-l-[var(--status-ko)]' : r.stato === 'eseguito' ? 'border-l-[3px] border-l-[var(--status-ok)]' : r.stato === 'non_eseguito' ? 'border-l-[3px] border-l-[var(--status-ko)]' : '';
  const num = spenta ? 'bg-[var(--status-ko-soft)] text-[var(--status-ko)]' : r.stato === 'eseguito' ? 'bg-[var(--status-ok-soft)] text-[var(--status-ok)]' : r.stato === 'non_eseguito' ? 'bg-[var(--status-ko-soft)] text-[var(--status-ko)]' : 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]';
  return (
    <button
      type="button"
      onClick={spenta ? undefined : () => onApri(r.index)}
      /* Densità: `px-3 py-2` invece di `p-3`, e gap 2.5. Sul telefono il root è 18px
         (globals.css), quindi `p-3` rendeva 13,5px per lato — 27px di padding verticale su
         78px di card, oltre un terzo. Stretto il contenitore, NON il testo: l'ODL resta a
         `text-base` e l'indirizzo a 13px, perché quelli sono il lavoro (§7quater). */
      className={`flex w-full items-center gap-2.5 rounded-[var(--radius-xl)] border border-[var(--brand-border)] px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${spenta ? 'cursor-not-allowed border-[var(--status-ko)] bg-[var(--status-ko-soft)]' : 'bg-[var(--brand-surface)] active:border-[var(--brand-primary)]'} ${bordo}`}
    >
      {/* Il numero d'ordine è cromatura, non dato: da h-8/w-8 (36px resi) a 28px. */}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums ${num}`}>{r.index + 1}</span>
      <span className={`min-w-0 flex-1 ${spenta ? 'opacity-70' : ''}`}>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* Prima di tutte le altre: è il motivo per cui questa riga sta in cima. */}
          {r.top && (
            <span className={`${PILL} ${PILL_TOP}`} title="Segnalato TOP da ACEA: da fare per primo">
              TOP
            </span>
          )}
          {r.annullato && (
            <span className={`${PILL} ${PILL_BLOCCO}`}>
              Annullato
            </span>
          )}
          {!r.annullato && r.bloccoPositivo && (
            <span className={`${PILL} ${PILL_BLOCCO}`}>
              Già positivo
            </span>
          )}
          {r.nuovo && (
            <span className={`${PILL} ${PILL_ATTESA}`}>
              Nuovo
            </span>
          )}
          {r.badge && (
            <span className={`${PILL} ${r.badge.tono === 'attesa' ? PILL_ATTESA : PILL_RIFIUTATO}`}>
              {r.badge.label}
            </span>
          )}
          {r.nota && (
            <span title="Nota dall'ufficio" aria-label="Nota dall'ufficio" className="inline-flex shrink-0 text-[var(--primary-text)]">
              <StickyNote size={14} strokeWidth={2} aria-hidden />
            </span>
          )}
          {r.notaCollega && (
            <span title="Nota da un collega (intervento precedente)" aria-label="Nota da un collega" className="inline-flex shrink-0 text-[var(--brand-text-muted)]">
              <Clock size={14} strokeWidth={2} aria-hidden />
            </span>
          )}
          <span className={`min-w-[10ch] flex-1 truncate text-base font-semibold text-[var(--brand-text-main)] ${spenta ? 'line-through' : ''}`}>{r.titolo}</span>
          {r.meta && (
            <span className="max-w-[45%] truncate text-xs font-medium text-[var(--brand-text-muted)]">
              {r.meta}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          {/* L'indirizzo sale a 13px: è il dato che l'operatore legge camminando, non un
              metadato. Gli altri secondari (attività, fascia) restano a 12 — §7quater. */}
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--brand-text-muted)]">{r.sub}</span>
          {/* La voce bloccata non è "Da fare": il chip di stato lascerebbe intendere il contrario. */}
          {!r.bloccoPositivo && (
            <Badge variant={chip.variant} className="shrink-0 gap-1">
              {r.stato === 'eseguito' && <Check size={12} strokeWidth={2.5} aria-hidden />}
              {chip.label}
            </Badge>
          )}
        </span>
        {r.bloccoPositivo && (
          <span className="mt-1 flex items-start gap-1 text-xs font-semibold text-[var(--status-ko)]">
            <Ban size={14} strokeWidth={2} aria-hidden className="mt-px shrink-0" />
            {r.bloccoPositivo}
          </span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0 text-[var(--brand-text-subtle)]" />
    </button>
  );
}

/**
 * Segmented dei filtri: `role=group` + `aria-pressed` sui tre bottoni — è lo stesso
 * pattern delle card-contatore §7ter. Senza, uno screen reader legge tre bottoni
 * identici e non dice quale filtro è attivo (il colore da solo non basta).
 * Estratto perché lo rimonta anche l'anteprima di «Azioni operatori»: la consolle deve
 * mostrare la lista VERA, non una sua imitazione che invecchia da sola.
 */
export function FiltriLista({
  filtro,
  conteggi,
  onFiltro,
}: {
  filtro: Filtro;
  conteggi: Record<Filtro, number>;
  onFiltro: (f: Filtro) => void;
}) {
  return (
    /* `p-0.5`: il `min-height: 46px` globale sui <button> (globals.css, ≤768px) fissa già
       l'altezza dei tre segmenti — il padding del contenitore ci si sommava sopra. */
    <div role="group" aria-label="Filtra gli interventi" className="mt-1.5 flex gap-1 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-0.5">
      {FILTRI.map(([k, lbl]) => (
        <button
          key={k}
          type="button"
          aria-pressed={filtro === k}
          onClick={() => onFiltro(k)}
          /* 44px, non 48: è il minimo WCAG sull'area di tocco, e qui i tre segmenti
             sono affiancati — ogni pixel in più si paga in altezza della lista. */
          className={`flex min-h-[44px] min-w-0 flex-auto items-center justify-center gap-1 rounded-full px-1 py-1 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] min-[380px]:text-sm ${
            filtro === k ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]' : 'text-[var(--brand-text-muted)]'
          }`}
        >
          <span className="truncate">{lbl}</span>
          <span
            className={`min-w-[1.25rem] shrink-0 rounded-full px-1 font-mono text-xs font-semibold tabular-nums ${
              filtro === k ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]' : 'bg-[var(--brand-surface)] text-[var(--brand-text-subtle)]'
            }`}
          >
            {conteggi[k]}
          </span>
        </button>
      ))}
    </div>
  );
}

export function RapportinoLista({
  staffName,
  tornaA = null,
  dataLabel,
  dataIso,
  voci,
  campi,
  infoCampi,
  riepilogo,
  righe,
  mancanti,
  filtro,
  onFiltro,
  onApri,
  onInvia,
  inviabile,
  inviando,
  readOnly,
  inviato,
  ricerca = '',
  taskVia,
  taskViaIbrido,
  mostraSaracinesche = false,
  committenti = [],
}: {
  staffName: string;
  /** Rotta di ritorno all'app (home «Il mio giorno»); null = arrivo da link, niente navigazione. */
  tornaA?: string | null;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  riepilogo: RiepilogoRapportino;
  righe: RigaVoce[];
  mancanti: { index: number; titolo: string; motivo: MotivoIncompleto }[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onApri: (index: number) => void;
  onInvia: () => void;
  inviabile: boolean;
  inviando: boolean;
  readOnly: boolean;
  inviato: boolean;
  ricerca?: string;
  /** Template task-via (BONIFICHE EXTRA): il PDF mostra gli ordini "+", non le vie contenitore. */
  taskVia?: boolean;
  /** Template ibrido: il PDF tiene le voci classiche e scarta solo i contenitori BONIFICHE EXTRA. */
  taskViaIbrido?: boolean;
  /** Mostra il riepilogo "Saracinesche esitate" (template con campo valvola). */
  mostraSaracinesche?: boolean;
  /** Committenti della giornata, già in etichetta leggibile: solo transito verso il PDF. */
  committenti?: string[];
}) {
  const righeCercate = righe.filter((r) => rigaMatchRicerca(r, ricerca));
  const [tentatoInvio, setTentatoInvio] = useState(false);
  const visibili = righeCercate.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );
  const conteggi: Record<Filtro, number> = {
    tutti: righeCercate.length,
    dafare: righeCercate.filter((r) => r.stato === 'da_fare').length,
    completati: righeCercate.filter((r) => r.stato !== 'da_fare').length,
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0 px-3 pt-2">
        <IntestazioneRiepilogo staffName={staffName} tornaA={tornaA} dataLabel={dataLabel} riepilogo={riepilogo} mostraSaracinesche={mostraSaracinesche} />
        <FiltriLista filtro={filtro} conteggi={conteggi} onFiltro={onFiltro} />
        {ricerca.trim() && (
          <p className="mt-2 px-1 text-xs text-[var(--brand-text-subtle)]">
            {righeCercate.length} risultat{righeCercate.length === 1 ? 'o' : 'i'} per «{ricerca.trim()}»
          </p>
        )}
      </div>

      {/* `space-y-1.5` invece di 2.5: il bordo a sinistra colorato già separa le card, il
          vuoto in mezzo non aggiunge leggibilità — aggiunge scroll. */}
      <div className="rapp-scroll flex-1 space-y-1.5 overflow-y-auto px-3 pb-[16rem] pt-2">
        {visibili.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento in questo filtro.</p>
        ) : (
          visibili.map((r) => <RigaVoceCard key={r.index} riga={r} onApri={onApri} />)
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-[480px] border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5">
          {inviato ? (
            <>
              <p className="mb-1.5 flex items-center justify-center gap-1 text-xs font-medium text-[var(--status-ok)]">
                <Check size={14} strokeWidth={2.5} aria-hidden />
                Rapportino inviato
              </p>
              <CondividiPdfButton
                staffName={staffName}
                committenti={committenti}
                dataLabel={dataLabel}
                dataIso={dataIso}
                voci={voci}
                campi={campi}
                infoCampi={infoCampi}
                taskVia={taskVia}
                taskViaIbrido={taskViaIbrido}
              />
            </>
          ) : (
            <>
              {!readOnly && tentatoInvio && mancanti.length > 0 && (
                <div className="mb-2 rounded-[var(--radius-xl)] border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--status-ko)]">
                      <AlertTriangle size={14} strokeWidth={2} aria-hidden className="shrink-0" />
                      Non puoi inviare: completa {mancanti.length} {mancanti.length === 1 ? 'intervento' : 'interventi'}
                    </p>
                    <Button
                      variant="ghost"
                      size="touch"
                      onClick={() => setTentatoInvio(false)}
                      aria-label="Chiudi avviso"
                      className="-mr-1 shrink-0"
                    >
                      <X size={16} strokeWidth={2} aria-hidden className="text-[var(--status-ko)]" />
                    </Button>
                  </div>
                  <div className="max-h-[30dvh] space-y-0.5 overflow-y-auto">
                    {mancanti.map((m) => (
                      <button
                        key={m.index}
                        type="button"
                        onClick={() => onApri(m.index)}
                        className="flex min-h-[48px] w-full items-center gap-2 rounded-[var(--radius-lg)] px-2 py-1 text-left text-[13px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:bg-[var(--brand-surface)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[var(--brand-text-main)]">
                          <span className="font-semibold">Intervento <span className="font-mono tabular-nums">{m.index + 1}</span></span>
                          {m.titolo ? <span className="text-[var(--brand-text-muted)]"> · {m.titolo}</span> : null}
                        </span>
                        <span className="max-w-[45%] shrink-0 whitespace-normal text-right font-semibold leading-tight text-[var(--status-ko)]">{MOTIVO_LABEL[m.motivo]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!readOnly && inviabile && (
                <p className="mb-1.5 flex items-center justify-center gap-1 text-xs font-medium text-[var(--status-ok)]">
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                  Tutti gli interventi hanno un esito
                </p>
              )}
              {!readOnly && (
                <Button
                  variant="primary"
                  size="touch"
                  className="w-full"
                  onClick={() => { if (inviabile) { onInvia(); } else { setTentatoInvio(true); } }}
                  loading={inviando}
                  disabled={inviando}
                >
                  {inviando ? 'Invio in corso…' : 'Invia rapportino'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}