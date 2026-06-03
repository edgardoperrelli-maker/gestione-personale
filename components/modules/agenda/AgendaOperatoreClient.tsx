'use client';

import { useState } from 'react';
import { esitiPerCommessa } from '@/lib/interventi/esitiCommessa';

export type AgendaIntervento = {
  id: string;
  odl: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  pdr: string | null;
  fascia_oraria: string | null;
  committente: string | null;
  stato: string;
  esito: string | null;
  esito_motivo: string | null;
};

const card =
  'rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm';
const cardStyle = { borderColor: 'var(--brand-border)' };

function badge(it: AgendaIntervento): { label: string; bg: string; fg: string } | null {
  if (it.stato !== 'completato') return null;
  if (it.esito === 'eseguito_positivo') return { label: 'Fatto', bg: 'var(--success-soft)', fg: 'var(--success)' };
  const conf = esitiPerCommessa(it.committente).causali.find((c) => c.chiave === it.esito);
  return { label: conf?.etichetta ?? 'Non fatto', bg: 'var(--danger-soft)', fg: 'var(--danger)' };
}

export default function AgendaOperatoreClient({
  token,
  operatore,
  data,
  readOnly,
  interventi,
}: {
  token: string;
  operatore: string;
  data: string;
  readOnly: boolean;
  interventi: AgendaIntervento[];
}) {
  const [items, setItems] = useState<AgendaIntervento[]>(interventi);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fatti = items.filter((i) => i.stato === 'completato').length;

  async function chiudi(it: AgendaIntervento, azione: 'fatto' | 'non_fatto', causale?: string) {
    setBusyId(it.id);
    setError(null);
    try {
      const res = await fetch(`/api/agenda/${token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interventoId: it.id, azione, causale, motivo: motivo.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore.');
        return;
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === it.id ? { ...x, stato: json.stato, esito: json.esito, esito_motivo: motivo.trim() || null } : x,
        ),
      );
      setOpenId(null);
      setMotivo('');
    } catch {
      setError('Errore di rete.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main
      className="min-h-screen w-full bg-[var(--brand-bg)] px-4 py-6 text-[var(--brand-text-main)]"
      style={{ paddingBottom: '4rem' }}
    >
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-bold">Agenda · {operatore}</h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            {data} · {fatti}/{items.length} completati{readOnly ? ' · sola lettura' : ''}
          </p>
        </header>

        {error && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        {items.length === 0 && (
          <div className={card} style={cardStyle}>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              Nessun intervento assegnato per oggi.
            </p>
          </div>
        )}

        {items.map((it) => {
          const b = badge(it);
          const causali = esitiPerCommessa(it.committente).causali;
          const aperto = openId === it.id;
          return (
            <div key={it.id} className={card} style={cardStyle}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{it.nominativo ?? it.odl ?? 'Intervento'}</div>
                  <div className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                    {[it.indirizzo, it.comune].filter(Boolean).join(', ') || '—'}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                    {[it.pdr ? `PDR ${it.pdr}` : null, it.fascia_oraria].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {b && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: b.bg, color: b.fg }}
                  >
                    {b.label}
                  </span>
                )}
              </div>

              {!readOnly && (
                <div className="mt-3">
                  {!aperto ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === it.id}
                        onClick={() => chiudi(it, 'fatto')}
                        className="flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                        style={{ backgroundColor: 'var(--success)' }}
                      >
                        ✅ Fatto
                      </button>
                      <button
                        type="button"
                        disabled={busyId === it.id}
                        onClick={() => {
                          setOpenId(it.id);
                          setMotivo('');
                          setError(null);
                        }}
                        className="flex-1 rounded-2xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                        style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      >
                        ❌ Non fatto
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-2xl border p-3" style={{ borderColor: 'var(--brand-border)' }}>
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
                        Causale
                      </div>
                      <textarea
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo (obbligatorio)"
                        rows={2}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
                      />
                      <div className="flex flex-wrap gap-2">
                        {causali.map((c) => (
                          <button
                            key={c.chiave}
                            type="button"
                            disabled={busyId === it.id}
                            onClick={() => chiudi(it, 'non_fatto', c.chiave)}
                            className="rounded-xl border px-3 py-1.5 text-sm transition disabled:opacity-50"
                            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
                          >
                            {c.etichetta}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="text-xs underline"
                        style={{ color: 'var(--brand-text-muted)' }}
                      >
                        Annulla
                      </button>
                    </div>
                  )}
                </div>
              )}

              {it.stato === 'completato' && it.esito_motivo && (
                <p className="mt-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                  {it.esito_motivo}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
