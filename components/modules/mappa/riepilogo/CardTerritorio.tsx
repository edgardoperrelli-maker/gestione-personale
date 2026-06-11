'use client';
import { statoBadge, whatsappHref, type RapportinoStato } from '@/utils/rapportini/links';
import type { TerritorioGruppo, PianoGruppo } from '@/utils/rapportini/groupByDayTerritory';

function fmtOra(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function CardTerritorio({
  terr, dataLabel, copiedToken, onCopia, onRiapri, onEliminaPiano, onRimuoviOp, onRiapriRapportino, confirmPiano, setConfirmPiano, confirmOp, setConfirmOp, busy, territori, onSposta, spostaOpen, setSpostaOpen,
}: {
  terr: TerritorioGruppo;
  dataLabel: string;
  copiedToken: string | null;
  onCopia: (r: RapportinoStato & { url: string; token: string }) => void;
  onRiapri: (pianoId: string) => string; // ritorna href
  onEliminaPiano: (pianoId: string) => void;
  onRimuoviOp: (pianoId: string, staffId: string) => void;
  onRiapriRapportino: (rapportinoId: string) => void;
  confirmPiano: string | null;
  setConfirmPiano: (v: string | null) => void;
  confirmOp: string | null;
  setConfirmOp: (v: string | null) => void;
  busy: boolean;
  territori: Array<{ id: string; name: string }>;
  onSposta: (rapportinoId: string, territorio: string | null) => void;
  spostaOpen: string | null;
  setSpostaOpen: (v: string | null) => void;
}) {
  const multiPiano = terr.piani.length > 1;
  const azioniPiano = (p: PianoGruppo) => (
    <span className="flex items-center gap-2 text-[11px]">
      <a href={onRiapri(p.piano_id)} className="font-medium text-[var(--brand-primary)] hover:opacity-90">↗ Riapri</a>
      {confirmPiano === p.piano_id ? (
        <>
          <button onClick={() => onEliminaPiano(p.piano_id)} disabled={busy} className="font-semibold text-[var(--danger)] disabled:opacity-50">Elimina piano</button>
          <button onClick={() => setConfirmPiano(null)} className="text-[var(--brand-text-muted)]">No</button>
        </>
      ) : (
        <button onClick={() => setConfirmPiano(p.piano_id)} className="text-[var(--brand-text-muted)] hover:text-[var(--danger)]">🗑 Elimina</button>
      )}
    </span>
  );

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brand-border)] px-3 py-2">
        <span className="text-sm font-semibold">
          {terr.etichetta}
          {multiPiano && <span className="ml-2 rounded-full border border-[var(--brand-primary-border)] px-2 py-0.5 text-[10px] text-[var(--brand-primary)]">{terr.piani.length} piani</span>}
        </span>
        {multiPiano
          ? <span className="text-xs text-[var(--brand-text-muted)]">{terr.nOperatori} operatori</span>
          : <span className="flex items-center gap-3"><span className="text-xs text-[var(--brand-text-muted)]">{terr.nOperatori} operatori</span>{azioniPiano(terr.piani[0])}</span>}
      </div>

      {terr.piani.map((p) => (
        <div key={p.piano_id}>
          {multiPiano && (
            <div className="flex items-center justify-between bg-[var(--brand-surface-muted)] px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase text-[var(--brand-text-muted)]">Piano · creato {fmtOra(p.creato_at)}</span>
              {azioniPiano(p)}
            </div>
          )}
          <ul className="divide-y divide-[var(--brand-border)]">
            {p.operatori.map((r) => {
              const badge = statoBadge(r.statoCalcolato);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.staff_name ?? 'Operatore'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                    <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                    {r.territorio_override && (
                      <span
                        className="rounded-full border border-[var(--brand-primary-border)] px-2 py-0.5 text-[10px] text-[var(--brand-primary)]"
                        title={`Spostato in ${r.territorio_override}`}
                      >↪ spostato</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                    <button onClick={() => onCopia(r)} className="rounded bg-[var(--brand-primary)] px-2 py-0.5 font-semibold text-[oklch(0.16_0.06_245)]">{copiedToken === r.token ? '✓' : '🔗'}</button>
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
                    <a
                      href={`/api/admin/rapportini/${r.id}/foto-zip`}
                      title="Scarica foto interventi manuali (ZIP)"
                      className="rounded border border-[var(--brand-border)] px-2 py-0.5"
                    >🖼️</a>
                    {spostaOpen === r.id ? (
                      <select
                        autoFocus
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => { const v = e.target.value; onSposta(r.id, v === '__reset__' || v === '' ? null : v); }}
                        onBlur={() => setSpostaOpen(null)}
                        className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] px-1 py-0.5 text-[11px]"
                      >
                        <option value="" disabled>Sposta in…</option>
                        {r.territorio_override && <option value="__reset__">↩ Riporta al piano</option>}
                        {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSpostaOpen(r.id)}
                        title="Sposta in un altro territorio"
                        className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[var(--brand-text-muted)] hover:text-[var(--brand-primary)]"
                      >↪</button>
                    )}
                    {confirmOp === r.id ? (
                      <>
                        <button onClick={() => onRimuoviOp(p.piano_id, r.staff_id)} disabled={busy} className="rounded border border-[var(--danger)] px-2 py-0.5 font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
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
        </div>
      ))}
    </div>
  );
}
