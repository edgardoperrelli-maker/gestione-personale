'use client';

import { useEffect, useState } from 'react';
import type { RigaRiconciliazione, TipoRiconciliazione } from '@/app/api/interventi/riconciliazione/route';

const TIPO_LABEL: Record<TipoRiconciliazione, { label: string; title: string }> = {
  doppio_positivo: { label: 'Doppio positivo (annullato)', title: 'Secondo "Fatto" sullo stesso ODL: intervento annullato, vale solo l’originale.' },
  negativo_dopo_positivo: { label: 'Negativo dopo positivo', title: 'Esito negativo su un ODL già chiuso positivo: visita non dovuta.' },
};

/** Banner "da riconciliare": interventi esitati su un ODL che era GIÀ completato positivo
 *  altrove (tipicamente positivo arrivato dopo la generazione del rapportino). Solo admin_plus. */
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center justify-between font-medium text-amber-900"
      >
        <span>⚠️ {righe.length} intervent{righe.length === 1 ? 'o' : 'i'} da riconciliare (ODL già positivo)</span>
        <span>{aperto ? '▲' : '▼'}</span>
      </button>
      {aperto && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-amber-800">
              <th className="pb-1 pr-3">ODL</th>
              <th className="pb-1 pr-3">Comune</th>
              <th className="pb-1 pr-3">Tipo</th>
              <th className="pb-1 pr-3">Nuova chiusura</th>
              <th className="pb-1 pr-3">Già positivo il</th>
              <th className="pb-1 pr-3" />
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} className="border-t border-amber-200">
                <td className="py-1 pr-3">{r.odl ?? '—'}</td>
                <td className="py-1 pr-3">{r.comune ?? '—'}</td>
                <td className="py-1 pr-3" title={TIPO_LABEL[r.tipo]?.title}>
                  {TIPO_LABEL[r.tipo]?.label ?? '—'}
                </td>
                <td className="py-1 pr-3">{r.data ?? '—'} ({r.esecutore ?? '—'})</td>
                <td className="py-1 pr-3">
                  {r.originale ? `${r.originale.data ?? '—'} (${r.originale.esecutore ?? '—'})` : '—'}
                </td>
                <td className="py-1 pr-3 text-right">
                  <button
                    type="button"
                    onClick={() => risolvi(r.id)}
                    disabled={risolvendo === r.id}
                    className="rounded border border-amber-400 px-2 py-0.5 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
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
