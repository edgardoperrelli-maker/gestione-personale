'use client';

import { useEffect, useRef, useState } from 'react';
import { formatGeocodeProgress, type GeocodeProgress } from '@/lib/interventi/geocodeStatus';

type FailedItem = { id: string; indirizzo: string | null; comune: string | null; cap: string | null };

export default function GeocodePanel({ batchId }: { batchId: string }) {
  const [progress, setProgress] = useState<GeocodeProgress>({ processati: 0, ok: 0, falliti: 0, restanti: 0 });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [falliti, setFalliti] = useState<FailedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const startedFor = useRef<string | null>(null);

  async function runLoop() {
    setRunning(true);
    setError(null);
    setDone(false);
    const acc: GeocodeProgress = { processati: 0, ok: 0, falliti: 0, restanti: 0 };
    try {
      for (;;) {
        const res = await fetch('/api/interventi/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(typeof json?.error === 'string' ? json.error : 'Errore geocodifica.');
          break;
        }
        acc.processati += json.processati ?? 0;
        acc.ok += json.ok ?? 0;
        acc.falliti += json.falliti ?? 0;
        acc.restanti = json.restanti ?? 0;
        setProgress({ ...acc });
        if (!json.processati || json.restanti === 0) break;
      }

      const f = await fetch(`/api/interventi/geocode?batchId=${encodeURIComponent(batchId)}`);
      const fj = await f.json();
      if (f.ok && Array.isArray(fj?.falliti)) setFalliti(fj.falliti as FailedItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setRunning(false);
      setDone(true);
    }
  }

  useEffect(() => {
    if (startedFor.current === batchId) return;
    startedFor.current = batchId;
    void runLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  function onResolved(id: string) {
    setFalliti((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <section
      className="space-y-4 rounded-[28px] border bg-[var(--brand-surface)] p-6 shadow-sm"
      style={{ borderColor: 'var(--brand-border)' }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>
          Geocodifica
        </h2>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {running ? 'Geocodifica in corso…' : done ? 'Geocodifica completata.' : 'In avvio…'}
          {running || done ? ` · ${formatGeocodeProgress(progress)}` : ''}
        </p>
      </div>

      {error && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}

      {!running && (done || !!error) && (
        <button
          type="button"
          onClick={() => void runLoop()}
          className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Riprendi geocodifica
        </button>
      )}

      {done && falliti.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Indirizzi da correggere ({falliti.length})
          </p>
          <ul className="space-y-3">
            {falliti.map((f) => (
              <FailedRow key={f.id} item={f} onResolved={() => onResolved(f.id)} />
            ))}
          </ul>
        </div>
      )}

      {done && falliti.length === 0 && !error && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
        >
          Tutti gli indirizzi del batch sono stati geocodificati.
        </div>
      )}
    </section>
  );
}

function FailedRow({ item, onResolved }: { item: FailedItem; onResolved: () => void }) {
  const [indirizzo, setIndirizzo] = useState(item.indirizzo ?? '');
  const [comune, setComune] = useState(item.comune ?? '');
  const [cap, setCap] = useState(item.cap ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onRetry() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/interventi/geocode/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, indirizzo, comune, cap }),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        onResolved();
        return;
      }
      setMsg(res.ok ? 'Ancora non trovato — correggi il toponimo e riprova.' : (json?.error ?? 'Errore.'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' };

  return (
    <li className="rounded-2xl border p-4" style={{ borderColor: 'var(--brand-border)' }}>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.7fr_auto] sm:items-center">
        <input
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          placeholder="Indirizzo"
          aria-label="Indirizzo"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <input
          value={comune}
          onChange={(e) => setComune(e.target.value)}
          placeholder="Comune"
          aria-label="Comune"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <input
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="CAP"
          aria-label="CAP"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onRetry}
          disabled={busy || indirizzo.trim() === ''}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? '…' : 'Ritenta'}
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
          {msg}
        </p>
      )}
    </li>
  );
}
