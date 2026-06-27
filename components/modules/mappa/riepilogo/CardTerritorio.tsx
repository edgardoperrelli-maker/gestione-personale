'use client';
import { useState } from 'react';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { TerritorioGruppo, PianoGruppo } from '@/utils/rapportini/groupByDayTerritory';
import ModaleScaricaFoto from './ModaleScaricaFoto';
import MenuSposta from './MenuSposta';

function fmtOra(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function CardTerritorio({
  terr, dataLabel, copiedToken, onCopia, onRiapriHref,
  onEliminaPiano, onRimuoviOp, onRiapriRapportino,
  confirmPiano, setConfirmPiano, confirmOp, setConfirmOp,
  busy, territori, onSpostaTerritorioOperatore, onSpostaDataOperatore, onSpostaPiano,
}: {
  terr: TerritorioGruppo;
  dataLabel: string;
  copiedToken: string | null;
  onCopia: (r: RapportinoStato & { url: string; token: string }) => void;
  onRiapriHref: (pianoId: string) => string;
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

  const AzioniPiano = ({ piano }: { piano: PianoGruppo }) => (
    <span className="flex items-center gap-2 text-[11px]">
      <a href={onRiapriHref(piano.piano_id)} className="font-medium text-[var(--brand-primary)] hover:opacity-90">↗ Riapri</a>
      <MenuSposta
        modo="piano"
        territori={territori}
        territorioCorrente={terr.chiave === '￿' ? null : terr.etichetta}
        onSpostaTerritorio={(t) => onSpostaPiano(piano.piano_id, { territorio: t })}
        onSpostaData={(d) => onSpostaPiano(piano.piano_id, { data: d })}
        busy={busy}
        label="Sposta piano ▾"
      />
      {confirmPiano === piano.piano_id ? (
        <>
          <button onClick={() => onEliminaPiano(piano.piano_id)} disabled={busy} className="font-semibold text-[var(--danger)] disabled:opacity-50">Elimina piano</button>
          <button onClick={() => setConfirmPiano(null)} className="text-[var(--brand-text-muted)]">No</button>
        </>
      ) : (
        <button onClick={() => setConfirmPiano(piano.piano_id)} className="text-[var(--brand-text-muted)] hover:text-[var(--danger)]">🗑 Elimina</button>
      )}
    </span>
  );

  return (
    <div
      className={`grow basis-[300px] min-w-[300px] max-w-[340px] rounded-xl bg-[var(--brand-surface)] ${
        terr.aiCreato ? 'border-2 border-[var(--success)]' : 'border border-[var(--brand-border)]'
      }`}
    >
      {/* Header card */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-2.5 py-1.5">
        <span className="truncate text-[13px] font-semibold">{terr.etichetta}</span>
        <span className="flex items-center gap-2 text-[11px]">
          {multiPiano && (
            <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
              {terr.piani.length} pianificazioni
            </span>
          )}
          <span className="text-xs text-[var(--brand-text-muted)]">{terr.nOperatori} operatori</span>
          {!multiPiano && <AzioniPiano piano={terr.piani[0]} />}
        </span>
      </div>

      {/* Corpo: una sezione per piano */}
      {terr.piani.map((piano, i) => (
        <div key={piano.piano_id}>
          {/* Fascia intestazione piano (solo se multi-piano) */}
          {multiPiano && (
            <div className="flex items-center justify-between gap-2 bg-[var(--brand-surface-muted)] px-2.5 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                🕓 Pianificazione {i + 1}{piano.creato_at ? ` · creata ${fmtOra(piano.creato_at)}` : ''}
              </span>
              <AzioniPiano piano={piano} />
            </div>
          )}

          {/* Lista operatori */}
          <ul className="divide-y divide-[var(--brand-border)]">
            {piano.operatori.map((r) => {
              const badge = statoBadge(r.statoCalcolato);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium">{r.staff_name ?? 'Operatore'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                    <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                    {(r.fotoInSospeso ?? 0) > 0 && (
                      <span
                        className="rounded-full bg-[var(--status-warn-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warn)]"
                        title="Foto ancora in caricamento dal telefono dell'operatore (non ancora sul server)"
                      >⏳ {r.fotoInSospeso} foto in sospeso</span>
                    )}
                    {r.territorio_override && (
                      <span
                        className="rounded-full bg-[var(--status-progress-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-progress)]"
                        title={`Spostato in ${r.territorio_override}`}
                      >↪ spostato</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                    <button onClick={() => onCopia(r)} className="rounded bg-[var(--brand-primary)] px-2 py-0.5 font-semibold text-[var(--on-primary)]">{copiedToken === r.token ? '✓' : '🔗'}</button>
                    <button
                      type="button"
                      onClick={() => onRiapriRapportino(r.id)}
                      disabled={busy || r.statoCalcolato === 'valido'}
                      title={r.statoCalcolato === 'valido' ? 'Aperto: l\'operatore può modificare' : 'Riapri per la modifica'}
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5 disabled:opacity-60"
                    >{r.statoCalcolato === 'valido' ? '🔓' : '🔒'}</button>
                    <a href={whatsappHref(r.url)} target="_blank" rel="noopener noreferrer" className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[var(--success)]">📲</a>
                    <a href={`/hub/rapportini/contenuto/${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">👁</a>
                    <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">⤓</a>
                    <button
                      type="button"
                      onClick={() => setFotoModal({ id: r.id, etichetta: `${r.staff_name ?? 'Operatore'} · ${dataLabel}` })}
                      title="Scarica foto"
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5"
                    >🖼️</button>
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
                        <button onClick={() => onRimuoviOp(piano.piano_id, r.staff_id)} disabled={busy} className="rounded border border-[var(--danger)] px-2 py-0.5 font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
                        <button onClick={() => setConfirmOp(null)} className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)]">No</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmOp(r.id)} className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)] hover:text-[var(--danger)]">✕</button>
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

      {fotoModal && (
        <ModaleScaricaFoto
          rapportinoId={fotoModal.id}
          etichetta={fotoModal.etichetta}
          onClose={() => setFotoModal(null)}
        />
      )}
    </div>
  );
}
