'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { riepilogoScarico, tuttiConsegnati } from '@/lib/interventi/riconsegnaLogic';

export type ScaricoRow = {
  id: string;
  matricola: string;
  odl: string | null;
  stato: string;
  indirizzo: string | null;
  operatore: string;
};

const TD = 'px-3 py-2';

export default function RiconsegnaClient({ giorno, righe }: { giorno: string; righe: ScaricoRow[] }) {
  const router = useRouter();
  const [consegnati, setConsegnati] = useState<Set<string>>(
    () => new Set(righe.filter((r) => r.stato === 'consegnato').map((r) => r.id)),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // stato "visuale" corrente in base alle spunte (per i conteggi live)
  const vista = righe.map((r) => ({ stato: consegnati.has(r.id) ? 'consegnato' : 'mancante' }));
  const ril = riepilogoScarico(vista);
  const completo = righe.length > 0 && tuttiConsegnati(vista);

  // raggruppa per operatore
  const gruppi = new Map<string, ScaricoRow[]>();
  for (const r of righe) {
    const arr = gruppi.get(r.operatore) ?? [];
    arr.push(r);
    gruppi.set(r.operatore, arr);
  }

  function toggle(id: string) {
    setConsegnati((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function post(url: string, body?: unknown): Promise<Record<string, unknown> | null> {
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
    const j = await post('/api/interventi/riconsegna/sync');
    if (j) {
      setMsg(`${j.creati ?? 0} misuratori importati dalle rimozioni.`);
      router.refresh();
    }
  }

  async function salva() {
    const j = await post('/api/interventi/riconsegna/consegna', { giorno, consegnatiIds: [...consegnati] });
    if (j) {
      setMsg(`Controllo salvato: ${j.consegnati} consegnati, ${j.mancanti} mancanti.`);
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Scarico misuratori in magazzino
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Rimozioni del giorno per operatore. Spunta i misuratori consegnati; i non spuntati restano da recuperare.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={giorno}
            onChange={(e) => router.push(`/hub/interventi/riconsegna?giorno=${e.target.value}`)}
            className="rounded-2xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={sync}
            className="rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
          >
            Sincronizza rimozioni
          </button>
        </div>
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
        style={{ borderColor: completo ? 'var(--success)' : ril.mancanti > 0 ? 'var(--danger)' : 'var(--brand-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--brand-text-main)' }}>
          Totale <strong>{ril.totale}</strong> · Consegnati <strong>{ril.consegnati}</strong> · Da recuperare{' '}
          <strong style={{ color: ril.mancanti > 0 ? 'var(--danger)' : undefined }}>{ril.mancanti}</strong>
        </span>
        {completo && <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>✅ Tutti consegnati</span>}
        <button
          type="button"
          disabled={busy || righe.length === 0}
          onClick={salva}
          className="ml-auto rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? '…' : 'Salva controllo'}
        </button>
      </div>

      {righe.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessuna rimozione registrata per questo giorno. Usa “Sincronizza rimozioni” per importarle dagli interventi chiusi.
        </div>
      ) : (
        [...gruppi.entries()].map(([operatore, items]) => {
          const fatti = items.filter((i) => consegnati.has(i.id)).length;
          return (
            <section key={operatore} className="rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
              <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: 'var(--brand-border)' }}>
                <h2 className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{operatore}</h2>
                <span className="text-xs" style={{ color: fatti === items.length ? 'var(--success)' : 'var(--brand-text-muted)' }}>
                  {fatti}/{items.length} consegnati
                </span>
              </div>
              <table className="min-w-full text-sm">
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                      <td className={TD}>
                        <input
                          type="checkbox"
                          aria-label={`Consegnato ${r.matricola}`}
                          checked={consegnati.has(r.id)}
                          onChange={() => toggle(r.id)}
                          disabled={busy}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                      </td>
                      <td className={`${TD} font-medium`}>{r.matricola}</td>
                      <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{r.odl ?? '—'}</td>
                      <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{r.indirizzo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </main>
  );
}
