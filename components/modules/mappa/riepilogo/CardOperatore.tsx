'use client';
import { useState } from 'react';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { OperatoreGruppo } from '@/utils/rapportini/groupByDayOperatore';
import ModaleScaricaFoto from './ModaleScaricaFoto';
import MenuSposta from './MenuSposta';

export default function CardOperatore({
  op, dataLabel, copiedToken, onCopia, onRiapriHref,
  onRimuoviOp, onRiapriRapportino,
  confirmOp, setConfirmOp,
  busy, territori, onSpostaTerritorioOperatore, onSpostaDataOperatore,
}: {
  op: OperatoreGruppo;
  dataLabel: string;
  copiedToken: string | null;
  onCopia: (r: RapportinoStato & { url: string; token: string }) => void;
  onRiapriHref: (pianoId: string) => string;
  onRimuoviOp: (pianoId: string, staffId: string) => void;
  onRiapriRapportino: (rapportinoId: string) => void;
  confirmOp: string | null;
  setConfirmOp: (v: string | null) => void;
  busy: boolean;
  territori: Array<{ id: string; name: string }>;
  onSpostaTerritorioOperatore: (rapportinoId: string, territorio: string | null) => void;
  onSpostaDataOperatore: (rapportinoId: string, data: string) => void;
}) {
  const [fotoModal, setFotoModal] = useState<{ id: string; etichetta: string } | null>(null);
  const multiComune = op.comuni.length > 1;

  return (
    <div
      className={`grow basis-[300px] min-w-[300px] max-w-[340px] rounded-xl bg-[var(--brand-surface)] ${
        op.aiCreato ? 'border-2 border-[var(--success)]' : 'border border-[var(--brand-border)]'
      }`}
    >
      {/* Header card: operatore */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-2.5 py-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">{op.staff_name ?? 'Operatore'}</span>
          <span className="truncate text-[11px] text-[var(--brand-text-muted)]">{op.comuni.join(', ')}</span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          {multiComune && (
            <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
              {op.comuni.length} comuni
            </span>
          )}
          <span className="text-xs text-[var(--brand-text-muted)]">{op.nInterventi} interventi</span>
        </span>
      </div>

      {/* Lista rapportini (uno per comune/piano) */}
      <ul className="divide-y divide-[var(--brand-border)]">
        {op.rapportini.map((r) => {
          const badge = statoBadge(r.statoCalcolato);
          const comune = (r.territorio ?? '').trim().toUpperCase() || 'Senza territorio';
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {multiComune && (
                  <span className="rounded-full bg-[var(--brand-surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-text-muted)]">{comune}</span>
                )}
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
                <a href={onRiapriHref(r.piano_id)} title="Apri nella pianificazione" className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-primary)] hover:opacity-90">↗</a>
                <button onClick={() => onCopia(r)} className="rounded bg-[var(--brand-primary)] px-2 py-0.5 font-semibold text-[var(--on-primary)]">{copiedToken === r.token ? '✓' : '🔗'}</button>
                <button
                  type="button"
                  onClick={() => onRiapriRapportino(r.id)}
                  disabled={busy || r.statoCalcolato === 'valido'}
                  title={r.statoCalcolato === 'valido' ? 'Aperto: l\'operatore può modificare' : 'Riapri per la modifica'}
                  className="rounded border border-[var(--brand-border)] px-2 py-0.5 disabled:opacity-60"
                >{r.statoCalcolato === 'valido' ? '🔓' : '🔒'}</button>
                <a href={whatsappHref(r.staff_name, dataLabel, r.url)} target="_blank" rel="noopener noreferrer" className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[var(--success)]">📲</a>
                <a href={`/hub/rapportini/contenuto/${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">👁</a>
                <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`} className="rounded border border-[var(--brand-border)] px-2 py-0.5">⤓</a>
                <button
                  type="button"
                  onClick={() => setFotoModal({ id: r.id, etichetta: `${op.staff_name ?? 'Operatore'} · ${comune} · ${dataLabel}` })}
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
                    <button onClick={() => onRimuoviOp(r.piano_id, r.staff_id)} disabled={busy} className="rounded border border-[var(--danger)] px-2 py-0.5 font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
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
