'use client';

import { useEffect, useState } from 'react';
import type { RigaRiconciliazione } from '@/app/api/interventi/riconciliazione/route';

/** Banner "da riconciliare": interventi chiusi Fatto il cui ODL era già completato positivo
 *  altrove (tipicamente il master non risultava ancora aggiornato in pianificazione). Solo admin_plus. */
export default function RiconciliazioneBanner() {
  const [righe, setRighe] = useState<RigaRiconciliazione[]>([]);
  const [aperto, setAperto] = useState(false);
  const [risolvendo, setRisolvendo] = useState<string | null>(null);

  const carica = async () => {
    const res = await fetch('/api/interventi/riconciliazione');
    if (!res.ok) return;
    const data = (await res.json()) as { righe: RigaRiconciliazione[] };
    setRighe(data.righe);
  };

  useEffect(() => {
    carica();
  }, []);

  const risolvi = async (id: string) => {
    setRisolvendo(id);
    try {
      const res = await fetch(`/api/interventi/riconciliazione/${id}`, { method: 'PATCH' });
      if (res.ok) setRighe((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setRisolvendo(null);
    }
  };

  if (righe.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center justify-between font-medium text-[var(--brand-text-main)]"
      >
        <span>⚠️ {righe.length} intervent{righe.length === 1 ? 'o' : 'i'} da riconciliare (doppio esito positivo)</span>
        <span>{aperto ? '▲' : '▼'}</span>
      </button>
      {aperto && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--brand-text-muted)]">
              <th className="pb-1 pr-3">ODL</th>
              <th className="pb-1 pr-3">Comune</th>
              <th className="pb-1 pr-3">Nuova chiusura</th>
              <th className="pb-1 pr-3">Già positivo il</th>
              <th className="pb-1 pr-3" />
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-border)]">
                <td className="py-1 pr-3">{r.odl ?? '—'}</td>
                <td className="py-1 pr-3">{r.comune ?? '—'}</td>
                <td className="py-1 pr-3">{r.data ?? '—'} ({r.esecutore ?? '—'})</td>
                <td className="py-1 pr-3">
                  {r.originale ? `${r.originale.data ?? '—'} (${r.originale.esecutore ?? '—'})` : '—'}
                </td>
                <td className="py-1 pr-3 text-right">
                  <button
                    type="button"
                    onClick={() => risolvi(r.id)}
                    disabled={risolvendo === r.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--warning)] px-2 py-0.5 text-[var(--brand-text-main)] transition-colors hover:bg-[var(--warning-soft)] disabled:opacity-50"
                  >
                    Risolto
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
