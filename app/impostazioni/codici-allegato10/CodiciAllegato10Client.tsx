'use client';

import { useState } from 'react';

type Codice = {
  codice: string;
  genera_allegato: boolean;
  discovered_at: string;
  last_seen_at: string;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

export default function CodiciAllegato10Client({ initialCodici }: { initialCodici: Codice[] }) {
  const [codici, setCodici] = useState<Codice[]>(initialCodici);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [newCode, setNewCode] = useState('');

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3000);
  };

  const toggle = async (codice: string, current: boolean) => {
    if (busy) return;
    setBusy(codice);
    try {
      const res = await fetch('/api/admin/allegato10-codici', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice, genera_allegato: !current }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Errore');
      setCodici(prev => prev.map(c => c.codice === codice ? { ...c, genera_allegato: !current } : c));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (codice: string) => {
    if (busy) return;
    setBusy(codice);
    try {
      const res = await fetch(`/api/admin/allegato10-codici?codice=${encodeURIComponent(codice)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Errore');
      setCodici(prev => prev.filter(c => c.codice !== codice));
      showFeedback('success', `${codice} rimosso.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(null);
    }
  };

  const addCode = async () => {
    const code = newCode.trim().toUpperCase();
    if (!code || codici.some(c => c.codice === code)) return;
    setBusy('__new__');
    try {
      const res = await fetch('/api/admin/allegato10-codici', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codici: [code] }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Errore');
      // Fetch updated list
      const listRes = await fetch('/api/admin/allegato10-codici');
      const { codici: updated } = await listRes.json();
      setCodici(updated ?? []);
      setNewCode('');
      showFeedback('success', `${code} aggiunto.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(null);
    }
  };

  const active = codici.filter(c => c.genera_allegato);
  const inactive = codici.filter(c => !c.genera_allegato);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Codici Allegato 10</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Attiva i codici servizio per i quali viene generato automaticamente l&apos;Allegato 10
          durante l&apos;esportazione rapportini. I codici vengono rilevati automaticamente dai
          file caricati in Mappa e Rapportini.
        </p>
      </div>

      {feedback && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm shadow-sm"
          style={
            feedback.type === 'success'
              ? { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#166534' }
              : { borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }
          }
        >
          {feedback.text}
        </div>
      )}

      {/* Aggiungi manualmente */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--brand-text-main)]">Aggiungi codice manualmente</h2>
        <div className="flex gap-2">
          <input
            value={newCode}
            onChange={e => setNewCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addCode()}
            placeholder="es. S-AI-049"
            className="flex-1 rounded-xl border border-[var(--brand-border)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCode}
            disabled={!newCode.trim() || busy === '__new__'}
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
          >
            {busy === '__new__' ? 'Aggiunta...' : 'Aggiungi'}
          </button>
        </div>
      </div>

      {/* Codici ATTIVI */}
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--brand-text-main)]">
          Allegato 10 attivo ({active.length} codici)
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun codice attivo.</p>
        ) : (
          <div className="space-y-2">
            {active.map(c => (
              <div
                key={c.codice}
                className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-mono text-sm font-semibold text-green-900">{c.codice}</span>
                  <span className="text-xs text-green-700">
                    visto il {new Date(c.last_seen_at).toLocaleDateString('it-IT')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === c.codice}
                    onClick={() => toggle(c.codice, c.genera_allegato)}
                    className="rounded-lg border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Disattiva
                  </button>
                  <button
                    type="button"
                    disabled={busy === c.codice}
                    onClick={() => remove(c.codice)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Codici RILEVATI ma non attivi */}
      {inactive.length > 0 && (
        <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-[var(--brand-text-main)]">
            Codici rilevati — Allegato 10 non attivo ({inactive.length})
          </h2>
          <div className="space-y-2">
            {inactive.map(c => (
              <div
                key={c.codice}
                className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-gray-50 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
                  <span className="font-mono text-sm text-[var(--brand-text-main)]">{c.codice}</span>
                  <span className="text-xs text-[var(--brand-text-muted)]">
                    visto il {new Date(c.last_seen_at).toLocaleDateString('it-IT')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy === c.codice}
                    onClick={() => toggle(c.codice, c.genera_allegato)}
                    className="rounded-lg bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                  >
                    Attiva
                  </button>
                  <button
                    type="button"
                    disabled={busy === c.codice}
                    onClick={() => remove(c.codice)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {codici.length === 0 && (
        <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun codice rilevato ancora. Carica un file Excel in Mappa o Rapportini per popolare automaticamente la lista.
        </div>
      )}
    </div>
  );
}
