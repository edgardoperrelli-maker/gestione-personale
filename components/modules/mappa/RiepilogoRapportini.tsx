'use client';

import { useCallback, useEffect, useState } from 'react';
import { statoBadge, whatsappHref } from '@/utils/rapportini/links';
import { groupRapportiniByDay, type RapRiepilogo, type GiornoGruppo } from '@/utils/rapportini/groupByDay';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function RiepilogoRapportini() {
  const [gruppi, setGruppi] = useState<GiornoGruppo[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmPiano, setConfirmPiano] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mappa/rapportini/riepilogo');
      const data = await res.json();
      setGruppi(groupRapportiniByDay(Array.isArray(data) ? (data as RapRiepilogo[]) : []));
    } catch {
      setGruppi([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const copia = async (r: RapRiepilogo) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch { /* noop */ }
  };

  const eliminaPiano = async (pianoId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/mappa/piani?id=${pianoId}`, { method: 'DELETE' });
      await carica();
    } finally {
      setBusy(false);
      setConfirmPiano(null);
    }
  };

  const rimuoviOperatore = async (pianoId: string, staffId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/mappa/piani/operatore?pianoId=${pianoId}&staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' });
      await carica();
    } finally {
      setBusy(false);
      setConfirmOp(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-[var(--brand-text-muted)]">Caricamento riepilogo...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold">Riepilogo rapportini</h2>

      {gruppi.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun rapportino.
        </div>
      ) : (
        gruppi.map((g) => (
          <div key={g.data} className="space-y-3">
            <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(g.data)}</h3>
            {g.piani.map((p) => (
              <div key={p.piano_id} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--brand-text-main)]">
                    {p.territorio ?? 'Senza territorio'} · {p.operatori.length} operatori
                  </span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/hub/mappa?vista=pianifica&pianoId=${p.piano_id}`}
                      className="rounded border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand-primary)] hover:opacity-90"
                    >
                      Riapri
                    </a>
                    {confirmPiano === p.piano_id ? (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => eliminaPiano(p.piano_id)} disabled={busy}
                          className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-50">
                          Elimina piano
                        </button>
                        <button onClick={() => setConfirmPiano(null)}
                          className="rounded border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)]">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmPiano(p.piano_id)}
                        className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]">
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {p.operatori.map((r) => {
                    const badge = statoBadge(r.statoCalcolato);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--brand-text-main)]">{r.staff_name ?? 'Operatore'}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                          <span className="text-xs text-[var(--brand-text-muted)]">{r.nVoci} interventi</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => copia(r)}
                            className="rounded bg-[var(--brand-primary)] px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.16_0.06_245)] hover:bg-[var(--brand-primary-hover)]">
                            {copiedToken === r.token ? '✓ Copiato!' : '🔗 Copia link'}
                          </button>
                          <a href={whatsappHref(r.staff_name, fmtData(r.data), r.url)} target="_blank" rel="noopener noreferrer"
                            className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)] hover:opacity-80">WhatsApp</a>
                          <a href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                            className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]">Excel</a>
                          {confirmOp === r.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button onClick={() => rimuoviOperatore(r.piano_id, r.staff_id)} disabled={busy}
                                className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)] disabled:opacity-50">Rimuovi?</button>
                              <button onClick={() => setConfirmOp(null)}
                                className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)]">No</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmOp(r.id)}
                              className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]">Rimuovi</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
