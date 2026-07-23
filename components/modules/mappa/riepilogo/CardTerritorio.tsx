'use client';
import { useState, type ReactNode } from 'react';
import {
  Check, Clock, Download, ExternalLink, Eye, Images, Link2, Lock, LockOpen,
  MessageCircle, Trash2, UserMinus,
} from 'lucide-react';
import Badge from '@/components/Badge';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { TerritorioGruppo, PianoGruppo } from '@/utils/rapportini/groupByDayTerritory';
import ModaleScaricaFoto from './ModaleScaricaFoto';
import MenuSposta from './MenuSposta';
import {
  AZIONE_ICONA, AZIONE_ICONA_DANGER, AZIONE_TESTO, AZIONE_TESTO_DANGER, AZIONE_TESTO_PRIMARIA,
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

/**
 * Azioni di una singola pianificazione. Sta FUORI dal corpo di CardTerritorio:
 * definirla dentro la rendeva un tipo nuovo a ogni render, e React rimontava il
 * sottoalbero — chiudendo il menu Sposta che ci vive dentro.
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
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={onRiapriHref(piano.piano_id)} className={AZIONE_TESTO_PRIMARIA}>
        <ExternalLink size={13} aria-hidden />
        Riapri
      </a>
      <MenuSposta
        modo="piano"
        territori={territori}
        territorioCorrente={etichettaTerritorio}
        onSpostaTerritorio={(t) => onSpostaPiano(piano.piano_id, { territorio: t })}
        onSpostaData={(d) => onSpostaPiano(piano.piano_id, { data: d })}
        busy={busy}
        label="Sposta piano"
      />
      {confirmPiano === piano.piano_id ? (
        <>
          <button type="button" onClick={() => onEliminaPiano(piano.piano_id)} disabled={busy} className={AZIONE_TESTO_DANGER}>
            <Trash2 size={13} aria-hidden />
            Elimina davvero
          </button>
          <button type="button" onClick={() => setConfirmPiano(null)} className={AZIONE_TESTO}>
            Annulla
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmPiano(piano.piano_id)} className={`${AZIONE_TESTO} hover:text-[var(--danger)]`}>
          <Trash2 size={13} aria-hidden />
          Elimina
        </button>
      )}
    </span>
  );
}

export default function CardTerritorio({
  terr, dataLabel, copiedToken, onCopia, onRiapriHref, onRiapriTerritorioHref,
  onEliminaPiano, onRimuoviOp, onRiapriRapportino,
  confirmPiano, setConfirmPiano, confirmOp, setConfirmOp,
  busy, territori, onSpostaTerritorioOperatore, onSpostaDataOperatore, onSpostaPiano,
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
      // Niente `overflow-hidden` qui: il pannello di MenuSposta esce dai bordi
      // della card (è `absolute right-0`) e verrebbe tagliato.
      className={`grow basis-[300px] min-w-[300px] max-w-[360px] rounded-[var(--radius-xl)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] ${
        terr.aiCreato ? 'border-2 border-[var(--success)]' : 'border border-[var(--brand-border)]'
      }`}
    >
      {/* Testa della card. Il nome del territorio ha la riga tutta per sé: prima
          divideva l'header coi contatori e con le azioni, e ogni territorio dal
          nome composto (LAZIO CENTRO, LAZIO EST) arrivava troncato anche a
          schermo largo — l'oggetto restava senza nome. */}
      <div className="border-b border-[var(--brand-border)] px-3 py-2">
        <h4 className="text-sm font-semibold leading-snug text-[var(--brand-text-main)]">
          {terr.etichetta}
        </h4>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          <N>{terr.nOperatori}</N> operatori · <N>{nInterventi}</N> interventi
          {multiPiano && <> · <N>{terr.piani.length}</N> pianificazioni</>}
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
          {/* Fascia intestazione piano (solo se multi-piano) */}
          {multiPiano && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-[var(--brand-surface-muted)] px-3 py-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-text-muted)]">
                <Clock size={12} aria-hidden />
                Pianificazione <N>{i + 1}</N>
                {piano.creato_at && <> · creata <N>{fmtOra(piano.creato_at)}</N></>}
              </span>
              <AzioniPiano piano={piano} {...azioniPiano} />
            </div>
          )}

          {/* Lista operatori */}
          <ul className="divide-y divide-[var(--brand-border)]">
            {piano.operatori.map((r) => {
              const badge = statoBadge(r.statoCalcolato);
              const aperto = r.statoCalcolato === 'valido';
              return (
                <li key={r.id} className="px-3 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-[var(--brand-text-main)]">{r.staff_name ?? 'Operatore'}</span>
                    <Badge variant={VARIANTE_STATO[r.statoCalcolato]}>{badge.label}</Badge>
                    <span className="text-xs text-[var(--brand-text-muted)]">
                      <N>{r.nVoci}</N> interventi
                    </span>
                    {(r.fotoInSospeso ?? 0) > 0 && (
                      <Badge variant="warn" title="Foto ancora in caricamento dal telefono dell'operatore (non ancora sul server)">
                        <N>{r.fotoInSospeso}</N>&nbsp;foto in sospeso
                      </Badge>
                    )}
                    {r.territorio_override && (
                      <Badge variant="progress" title={`Spostato in ${r.territorio_override}`}>spostato</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onCopia(r)}
                      aria-label={copiedToken === r.token ? 'Link copiato' : 'Copia il link del rapportino'}
                      className={AZIONE_ICONA}
                    >
                      {copiedToken === r.token
                        ? <Check size={13} className="text-[var(--status-ok)]" aria-hidden />
                        : <Link2 size={13} aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRiapriRapportino(r.id)}
                      disabled={busy || aperto}
                      aria-label={aperto ? 'Rapportino aperto: l’operatore può modificarlo' : 'Riapri il rapportino per la modifica'}
                      className={AZIONE_ICONA}
                    >
                      {aperto ? <LockOpen size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                    </button>
                    <a
                      href={whatsappHref(r.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Invia il link su WhatsApp"
                      className={AZIONE_ICONA}
                    >
                      <MessageCircle size={13} aria-hidden />
                    </a>
                    <a
                      href={`/hub/rapportini/contenuto/${r.id}`}
                      aria-label="Apri il contenuto del rapportino"
                      className={AZIONE_ICONA}
                    >
                      <Eye size={13} aria-hidden />
                    </a>
                    <a
                      href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                      aria-label="Esporta il rapportino in Excel"
                      className={AZIONE_ICONA}
                    >
                      <Download size={13} aria-hidden />
                    </a>
                    <button
                      type="button"
                      onClick={() => setFotoModal({ id: r.id, etichetta: `${r.staff_name ?? 'Operatore'} · ${dataLabel}` })}
                      aria-label="Scarica le foto del rapportino"
                      className={AZIONE_ICONA}
                    >
                      <Images size={13} aria-hidden />
                    </button>
                    <MenuSposta
                      modo="operatore"
                      territori={territori}
                      territorioCorrente={r.territorio_override ?? null}
                      onSpostaTerritorio={(t) => onSpostaTerritorioOperatore(r.id, t)}
                      onSpostaData={(d) => onSpostaDataOperatore(r.id, d)}
                      busy={busy}
                    />
                    {confirmOp === r.id ? (
                      <>
                        <button type="button" onClick={() => onRimuoviOp(piano.piano_id, r.staff_id)} disabled={busy} className={AZIONE_TESTO_DANGER}>
                          Rimuovi davvero
                        </button>
                        <button type="button" onClick={() => setConfirmOp(null)} className={AZIONE_TESTO}>
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmOp(r.id)}
                        aria-label="Rimuovi l’operatore dalla pianificazione"
                        className={AZIONE_ICONA_DANGER}
                      >
                        <UserMinus size={13} aria-hidden />
                      </button>
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
