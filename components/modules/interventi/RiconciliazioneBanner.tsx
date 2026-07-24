'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
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
    <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] font-medium text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <span className="flex items-center gap-2">
          <TriangleAlert size={15} className="shrink-0 text-[var(--warning)]" aria-hidden />
          {righe.length} intervent{righe.length === 1 ? 'o' : 'i'} da riconciliare (ODL già positivo)
        </span>
        {aperto ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {aperto && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--brand-text-muted)]">
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
              <tr key={r.id} className="border-t border-[var(--brand-border)]">
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
