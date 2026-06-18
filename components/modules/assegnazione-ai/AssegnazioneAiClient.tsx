'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type RigaPianificabile = {
  id: string;
  file: string;
  riga: number;
  odl: string | null;
  matricola: string | null;
  indirizzo: string | null;
  comune: string | null;
  data: string;
  esecutore: string | null;
  scansionato_il: string;
};

export type FileConfig = {
  file: string;
  committente: string;
  attivita: string;
  template_id: string | null;
};

const cardStyle = {
  borderColor: 'var(--brand-border)',
  backgroundColor: 'var(--brand-surface)',
} as const;

function oggiPiuUno(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AssegnazioneAiClient({
  righe,
  fileConfig,
  pianificaData,
}: {
  righe: RigaPianificabile[];
  fileConfig: FileConfig[];
  pianificaData: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<string>(oggiPiuUno);
  const [selezione, setSelezione] = useState<Set<string>>(() => new Set(righe.map((r) => r.id)));
  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fileCfgMap = new Map<string, { committente: string; attivita: string }>(
    fileConfig.map((fc) => [fc.file, { committente: fc.committente, attivita: fc.attivita }]),
  );

  async function leggi() {
    setArming(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/leggi-pianificabili', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg('In attesa: l’agente legge il giorno al prossimo contatto (entro 1 min).');
        router.refresh();
      } else {
        setMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
      }
    } catch (e) {
      setMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setArming(false);
    }
  }

  const tuttiSelezionati = righe.length > 0 && selezione.size === righe.length;

  function toggleTutti() {
    if (tuttiSelezionati) {
      setSelezione(new Set());
    } else {
      setSelezione(new Set(righe.map((r) => r.id)));
    }
  }

  function toggleRiga(id: string) {
    setSelezione((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Assegnazione AI
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Pianificazione automatica degli interventi dal file.
        </p>
      </header>

      {/* Barra data + Leggi */}
      <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Lettura file</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label
              htmlFor="assegnazione-data"
              className="block text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Giorno da pianificare
            </label>
            <input
              id="assegnazione-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="block rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{
                borderColor: 'var(--brand-border)',
                backgroundColor: 'var(--brand-surface)',
                color: 'var(--brand-text-main)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void leggi()}
            disabled={arming}
            className="rounded-xl border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60"
            style={{
              borderColor: 'var(--brand-primary)',
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-text-main)',
            }}
          >
            {arming ? 'Invio…' : 'Leggi dal file'}
          </button>
        </div>

        {pianificaData && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--warning)',
              backgroundColor: 'var(--warning-soft)',
              color: 'var(--brand-text-main)',
            }}
          >
            <span>⏳ In attesa di lettura per il giorno {pianificaData}</span>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="ml-auto rounded-lg border px-2 py-0.5 text-xs font-medium"
              style={{ borderColor: 'var(--brand-border)' }}
            >
              ↻ Aggiorna
            </button>
          </div>
        )}

        {msg && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>
        )}
      </section>

      {/* Tabella righe pianificabili */}
      <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Righe pianificabili
          </h2>
          <button
            type="button"
            disabled
            title="Disponibile nella Fase 2"
            className="rounded-xl border px-4 py-1.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: 'var(--brand-primary)',
              backgroundColor: 'var(--brand-primary-soft)',
              color: 'var(--brand-text-main)',
            }}
          >
            Procedi ({selezione.size} righe)
          </button>
        </div>

        {righe.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Nessuna riga pianificabile. Usa &quot;Leggi dal file&quot; per caricare i dati.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--brand-text-muted)' }}>
                  <th className="px-2 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={tuttiSelezionati}
                      onChange={toggleTutti}
                      aria-label="Seleziona tutte le righe"
                    />
                  </th>
                  {['File', 'Riga', 'ODL', 'Matricola', 'Indirizzo', 'Comune', 'Data', 'Esecutore', 'Gruppo attività', 'Committente'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => {
                  const cfg = fileCfgMap.get(r.file);
                  const sel = selezione.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderTop: '1px solid var(--brand-border)',
                        color: 'var(--brand-text-main)',
                        backgroundColor: sel ? 'var(--brand-primary-soft)' : undefined,
                      }}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleRiga(r.id)}
                          aria-label={`Seleziona riga ${r.riga}`}
                        />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.file}</td>
                      <td className="px-2 py-1.5">{r.riga}</td>
                      <td className="px-2 py-1.5">{r.odl ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.matricola ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.indirizzo ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.comune ?? '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.data}</td>
                      <td className="px-2 py-1.5">{r.esecutore ?? '—'}</td>
                      <td className="px-2 py-1.5">{cfg?.attivita ?? '—'}</td>
                      <td className="px-2 py-1.5">{cfg?.committente ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
