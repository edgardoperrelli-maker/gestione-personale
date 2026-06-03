'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PENALE_MISURATORE } from '@/lib/interventi/riconsegnaLogic';

export type MisuratoreRow = {
  id: string;
  matricola: string;
  odl: string | null;
  contratto: string | null;
  utenza: string | null;
  stato: string;
  data_rimozione: string | null;
};

const TH = 'px-3 py-2 text-left font-semibold';
const TD = 'px-3 py-2';

export default function RiconsegnaClient({ misuratori }: { misuratori: MisuratoreRow[] }) {
  const router = useRouter();
  const [consegnati, setConsegnati] = useState<Set<string>>(() => new Set(misuratori.map((m) => m.id)));
  const [firma, setFirma] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mancanti = misuratori.length - consegnati.size;
  const penalePreview = mancanti * PENALE_MISURATORE;

  function toggle(id: string) {
    setConsegnati((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function call(url: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore.');
        return null;
      }
      return json;
    } catch {
      setError('Errore di rete.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    const j = await call('/api/interventi/riconsegna/sync');
    if (j) {
      setMsg(`${j.creati ?? 0} misuratori importati dal magazzino.`);
      router.refresh();
    }
  }

  async function registra() {
    const j = await call('/api/interventi/riconsegna/consegna', { consegnatiIds: [...consegnati], firma });
    if (j) {
      setMsg(`Consegna registrata: ${j.consegnati} consegnati, ${j.mancanti} mancanti · penale €${j.penale}.`);
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Riconsegna misuratori
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Cesta corrente: {misuratori.length} in custodia · spunta i consegnati, i non spuntati diventano mancanti.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={sync}
          className="rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Sincronizza dal magazzino
        </button>
      </header>

      {error && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          {msg}
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3"
        style={{ borderColor: mancanti > 0 ? 'var(--danger)' : 'var(--brand-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--brand-text-main)' }}>
          Consegnati <strong>{consegnati.size}</strong> · Mancanti <strong>{mancanti}</strong>
        </span>
        <span className="text-sm font-semibold" style={{ color: mancanti > 0 ? 'var(--danger)' : 'var(--success)' }}>
          Penale stimata: €{penalePreview.toLocaleString('it-IT')}
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm" style={{ color: 'var(--brand-text-main)' }}>
          <input type="checkbox" checked={firma} onChange={(e) => setFirma(e.target.checked)} className="h-4 w-4 accent-[var(--brand-primary)]" />
          Riepilogo firmato
        </label>
        <button
          type="button"
          disabled={busy || misuratori.length === 0}
          onClick={registra}
          className="rounded-2xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? '…' : 'Registra consegna'}
        </button>
      </div>

      {misuratori.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessun misuratore in custodia. Usa “Sincronizza dal magazzino” per importare quelli rimossi.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--brand-text-muted)' }}>
                <th className={TD}>Consegnato</th>
                <th className={TH}>Matricola</th>
                <th className={TH}>ODL</th>
                <th className={TH}>Contratto</th>
                <th className={TH}>Rimozione</th>
              </tr>
            </thead>
            <tbody>
              {misuratori.map((m) => (
                <tr key={m.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      aria-label={`Consegnato ${m.matricola}`}
                      checked={consegnati.has(m.id)}
                      onChange={() => toggle(m.id)}
                      disabled={busy}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                  </td>
                  <td className={TD}>{m.matricola}</td>
                  <td className={TD}>{m.odl ?? '—'}</td>
                  <td className={TD}>{m.contratto ?? '—'}</td>
                  <td className={TD}>{m.data_rimozione ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
