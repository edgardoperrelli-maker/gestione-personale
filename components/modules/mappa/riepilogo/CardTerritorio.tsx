'use client';
import { useState, type ReactNode } from 'react';
import { Check, ExternalLink, Eye, Link2, MessageCircle } from 'lucide-react';
import Badge from '@/components/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { TerritorioGruppo, PianoGruppo } from '@/utils/rapportini/groupByDayTerritory';
import ModaleScaricaFoto from './ModaleScaricaFoto';
import MenuAzioni, { type VoceAzione } from './MenuAzioni';
import {
  AZIONE_ICONA, AZIONE_TESTO, AZIONE_TESTO_DANGER, AZIONE_TESTO_PRIMARIA,
} from './stili';

function fmtOra(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Variante del Badge di stato; l'etichetta continua a venire da `statoBadge`. */
const VARIANTE_STATO: Record<RapportinoStato['statoCalcolato'], 'ok' | 'warn' | 'ko'> = {
  inviato: 'ok',
  valido: 'warn',
  scaduto: 'ko',
};

const contaInterventi = (piani: PianoGruppo[]) =>
  piani.reduce((s, p) => s + p.operatori.reduce((x, o) => x + (o.nVoci ?? 0), 0), 0);

/** Cifra in mono tabulare: le colonne di conteggi si allineano fra card e card. */
function N({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

// Il nome del comando si scrive UNA volta: va nell'aria-label (nome accessibile)
// e nel Tooltip (descrizione visiva, aria-hidden). Niente `title`.
function BottoneIcona({ nome, onClick, disabled, children }: {
  nome: string; onClick: () => void; disabled?: boolean; children: ReactNode;
}) {
  return (
    <Tooltip testo={nome}>
      <button type="button" onClick={onClick} disabled={disabled} aria-label={nome} className={AZIONE_ICONA}>
        {children}
      </button>
    </Tooltip>
  );
}

function LinkIcona({ nome, href, nuovaScheda, children }: {
  nome: string; href: string; nuovaScheda?: boolean; children: ReactNode;
}) {
  return (
    <Tooltip testo={nome}>
      <a
        href={href}
        {...(nuovaScheda ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        aria-label={nome}
        className={AZIONE_ICONA}
      >
        {children}
      </a>
    </Tooltip>
  );
}

/**
 * Azioni di una pianificazione: resta a vista solo «Riapri», il resto entra nel
 * menu dove ogni voce ha un nome scritto. Sta FUORI dal corpo di CardTerritorio
 * perché definirla dentro la rendeva un tipo nuovo a ogni render, e React
 * rimontava il sottoalbero chiudendo il menu che ci vive dentro.
 */
function AzioniPiano({
  piano, etichettaTerritorio, territori, busy, confirmPiano, setConfirmPiano,
  onRiapriHref, onEliminaPiano, onSpostaPiano,
}: {
  piano: PianoGruppo;
  etichettaTerritorio: string | null;
  territori: Array<{ id: string; name: string }>;
  busy: boolean;
  confirmPiano: string | null;
  setConfirmPiano: (v: string | null) => void;
  onRiapriHref: (pianoId: string) => string;
  onEliminaPiano: (pianoId: string) => void;
  onSpostaPiano: (pianoId: string, opts: { data?: string; territorio?: string | null }) => void;
}) {
  const voci: VoceAzione[] = [
    {
      tipo: 'sposta',
      territori,
      territorioCorrente: etichettaTerritorio,
      onSpostaTerritorio: (t) => onSpostaPiano(piano.piano_id, { territorio: t }),
      onSpostaData: (d) => onSpostaPiano(piano.piano_id, { data: d }),
    },
    { tipo: 'bottone', label: 'Elimina la pianificazione', danger: true, onClick: () => setConfirmPiano(piano.piano_id) },
  ];

  if (confirmPiano === piano.piano_id) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => onEliminaPiano(piano.piano_id)} disabled={busy} className={AZIONE_TESTO_DANGER}>
          Elimina
        </button>
        <button type="button" onClick={() => setConfirmPiano(null)} className={AZIONE_TESTO}>
          Annulla
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <LinkIcona nome="Riapri questa pianificazione" href={onRiapriHref(piano.piano_id)}>
        <ExternalLink size={13} aria-hidden />
      </LinkIcona>
      <MenuAzioni voci={voci} busy={busy} ariaLabel="Altre azioni sulla pianificazione" />
    </span>
  );
}

export default function CardTerritorio({
  terr, dataLabel, copiedToken, onCopia, onRiapriHref, onRiapriTerritorioHref,
  onEliminaPiano, onRimuoviOp, onRiapriRapportino,
  confirmPiano, setConfirmPiano, confirmOp, setConfirmOp,
  busy, territori, onSpostaTerritorioOperatore, onSpostaDataOperatore, onSpostaPiano,
  soloTerritorioDelGiorno = false,
}: {
  terr: TerritorioGruppo;
  dataLabel: string;
  copiedToken: string | null;
  onCopia: (r: RapportinoStato & { url: string; token: string }) => void;
  onRiapriHref: (pianoId: string) => string;
  onRiapriTerritorioHref: (terr: TerritorioGruppo) => string;
  onEliminaPiano: (pianoId: string) => void;
  onRimuoviOp: (pianoId: string, staffId: string) => void;
  onRiapriRapportino: (rapportinoId: string) => void;
  confirmPiano: string | null;
  setConfirmPiano: (v: string | null) => void;
  confirmOp: string | null;
  setConfirmOp: (v: string | null) => void;
  busy: boolean;
  territori: Array<{ id: string; name: string }>;
  onSpostaTerritorioOperatore: (rapportinoId: string, territorio: string | null) => void;
  onSpostaDataOperatore: (rapportinoId: string, data: string) => void;
  onSpostaPiano: (pianoId: string, opts: { data?: string; territorio?: string | null }) => void;
  /** Unico territorio del giorno: si tiene un tetto, altrimenti si stirerebbe su tutta la riga. */
  soloTerritorioDelGiorno?: boolean;
}) {
  const [fotoModal, setFotoModal] = useState<{ id: string; etichetta: string } | null>(null);
  const multiPiano = terr.piani.length > 1;
  const etichettaTerritorio = terr.chiave === '￿' ? null : terr.etichetta;
  const nInterventi = contaInterventi(terr.piani);

  const azioniPiano = {
    etichettaTerritorio, territori, busy, confirmPiano, setConfirmPiano,
    onRiapriHref, onEliminaPiano, onSpostaPiano,
  };

  return (
    <div
      // Niente `overflow-hidden` qui: i pannelli dei menu escono dai bordi della
      // card (sono `absolute right-0`) e verrebbero tagliati.
      //
      // Larghezza: da `xl` in su i territori stanno tutti sulla stessa riga e se
      // la spartiscono in parti uguali, riempiendola fino in fondo — prima un
      // tetto di 360px lasciava 178px morti a destra sui giorni con 4 territori.
      // Il tetto resta per il territorio unico del giorno, che altrimenti si
      // stirerebbe su tutta la riga (già scartato il 19/06).
      className={`grow basis-[300px] min-w-[300px] xl:min-w-0 xl:flex-1 xl:basis-0 rounded-[var(--radius-xl)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] ${
        soloTerritorioDelGiorno ? 'max-w-[420px]' : ''
      } ${
        terr.aiCreato ? 'border-2 border-[var(--success)]' : 'border border-[var(--brand-border)]'
      }`}
    >
      {/* Testa della card. Il nome del territorio ha la riga tutta per sé:
          prima divideva l'header coi contatori e con le azioni, e ogni nome
          composto (LAZIO CENTRO, LAZIO EST) arrivava troncato. */}
      <div className="border-b border-[var(--brand-border)] px-3 py-2">
        <h4 className="text-sm font-semibold leading-snug text-[var(--brand-text-main)]">
          {terr.etichetta}
        </h4>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          <N>{terr.nOperatori}</N> operatori · <N>{nInterventi}</N> interventi
          {multiPiano && <> · <N>{terr.piani.length}</N> piani</>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {multiPiano ? (
            <a href={onRiapriTerritorioHref(terr)} className={AZIONE_TESTO_PRIMARIA}>
              <ExternalLink size={13} aria-hidden />
              Riapri tutto il territorio
            </a>
          ) : (
            <AzioniPiano piano={terr.piani[0]} {...azioniPiano} />
          )}
        </div>
      </div>

      {/* Corpo: una sezione per piano */}
      {terr.piani.map((piano, i) => (
        <div key={piano.piano_id}>
          {/* Fascia intestazione piano (solo se multi-piano). Etichetta corta —
              «Piano 1 · 15:07» invece di «Pianificazione 1 · creata 15:07» —
              perché a 1280px la versione lunga veniva tagliata a «Pianific…»,
              cioè il numero del piano e l'ora sparivano entrambi. */}
          {multiPiano && (
            <div className="flex items-center justify-between gap-2 bg-[var(--brand-surface-muted)] px-3 py-1">
              <span className="min-w-0 truncate text-xs font-medium text-[var(--brand-text-muted)]">
                Piano <N>{i + 1}</N>
                {piano.creato_at && <> · <N>{fmtOra(piano.creato_at)}</N></>}
              </span>
              <AzioniPiano piano={piano} {...azioniPiano} />
            </div>
          )}

          {/* Lista operatori */}
          <ul className="divide-y divide-[var(--brand-border)]">
            {piano.operatori.map((r) => {
              const badge = statoBadge(r.statoCalcolato);
              const aperto = r.statoCalcolato === 'valido';
              const copiato = copiedToken === r.token;
              const voci: VoceAzione[] = [
                {
                  tipo: 'bottone',
                  label: aperto ? 'Già aperto alla modifica' : 'Riapri per la modifica',
                  disabilitato: aperto,
                  onClick: () => onRiapriRapportino(r.id),
                },
                { tipo: 'link', label: 'Esporta il rapportino in Excel', href: `/api/mappa/rapportini/export?rapportinoId=${r.id}` },
                {
                  tipo: 'bottone',
                  label: 'Scarica le foto',
                  onClick: () => setFotoModal({ id: r.id, etichetta: `${r.staff_name ?? 'Operatore'} · ${dataLabel}` }),
                },
                {
                  tipo: 'sposta',
                  territori,
                  territorioCorrente: r.territorio_override ?? null,
                  onSpostaTerritorio: (t) => onSpostaTerritorioOperatore(r.id, t),
                  onSpostaData: (d) => onSpostaDataOperatore(r.id, d),
                },
                { tipo: 'bottone', label: 'Rimuovi dalla pianificazione', danger: true, onClick: () => setConfirmOp(r.id) },
              ];
              return (
                <li key={r.id} className="px-3 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-[var(--brand-text-main)]">{r.staff_name ?? 'Operatore'}</span>
                    <Badge variant={VARIANTE_STATO[r.statoCalcolato]}>{badge.label}</Badge>
                    <span className="text-xs text-[var(--brand-text-muted)]">
                      <N>{r.nVoci}</N> interventi
                    </span>
                    {(r.fotoInSospeso ?? 0) > 0 && (
                      <Badge variant="warn"><N>{r.fotoInSospeso}</N>&nbsp;foto in sospeso</Badge>
                    )}
                    {r.territorio_override && (
                      <Badge variant="progress">spostato in {r.territorio_override}</Badge>
                    )}
                  </div>

                  {/* Comandi: restano a vista i tre del giro quotidiano, tutto il
                      resto sta nel menu con un nome scritto. Prima erano otto
                      quadratini grigi identici, e a 1280px andavano a due righe. */}
                  <div className="mt-1 flex items-center gap-1">
                    {confirmOp === r.id ? (
                      <>
                        <button type="button" onClick={() => onRimuoviOp(piano.piano_id, r.staff_id)} disabled={busy} className={AZIONE_TESTO_DANGER}>
                          Rimuovi
                        </button>
                        <button type="button" onClick={() => setConfirmOp(null)} className={AZIONE_TESTO}>
                          Annulla
                        </button>
                      </>
                    ) : (
                      <>
                        <BottoneIcona
                          nome={copiato ? 'Link copiato' : 'Copia il link del rapportino'}
                          onClick={() => onCopia(r)}
                        >
                          {copiato
                            ? <Check size={13} className="text-[var(--status-ok)]" aria-hidden />
                            : <Link2 size={13} aria-hidden />}
                        </BottoneIcona>
                        <LinkIcona nome="Invia il link su WhatsApp" href={whatsappHref(r.url)} nuovaScheda>
                          <MessageCircle size={13} aria-hidden />
                        </LinkIcona>
                        <LinkIcona nome="Apri il contenuto del rapportino" href={`/hub/rapportini/contenuto/${r.id}`}>
                          <Eye size={13} aria-hidden />
                        </LinkIcona>
                        <MenuAzioni voci={voci} busy={busy} ariaLabel="Altre azioni sul rapportino" />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Divisore netto tra pianificazioni (tranne dopo l'ultima) */}
          {multiPiano && i < terr.piani.length - 1 && (
            <div className="h-[3px] bg-[var(--brand-surface-muted)]" />
          )}
        </div>
      ))}

      <ModaleScaricaFoto
        open={fotoModal !== null}
        rapportinoId={fotoModal?.id ?? null}
        etichetta={fotoModal?.etichetta ?? ''}
        onClose={() => setFotoModal(null)}
      />
    </div>
  );
}
