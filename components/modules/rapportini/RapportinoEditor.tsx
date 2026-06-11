'use client';

import { useState } from 'react';
import { valoreInfo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { voceEsitoColore } from '@/utils/rapportini/voceColore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type VoceEditabile = VoceInfo & {
  id: string;
  ordine: number;
  risposte: Record<string, unknown> | null;
};

const TH = 'px-3 py-2 text-left font-semibold align-bottom';
const TD = 'px-3 py-2 align-top';

const BADGE: Record<'verde' | 'rossa' | 'neutro', { label: string; bg: string; fg: string }> = {
  verde: { label: '🟢 Fatto', bg: 'var(--success-soft, #dcfce7)', fg: 'var(--success, #166534)' },
  rossa: { label: '🔴 Non fatto', bg: 'var(--danger-soft, #fee2e2)', fg: 'var(--danger, #991b1b)' },
  neutro: { label: '⚪ Da fare', bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const cellInput =
  'w-full rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

function CellaCampo({
  campo,
  valore,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  onChange: (v: unknown) => void;
}) {
  if (campo.tipo === 'crocetta') {
    return (
      <input
        type="checkbox"
        checked={valore === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--brand-primary)]"
        aria-label={campo.etichetta}
      />
    );
  }
  if (campo.tipo === 'select') {
    return (
      <select value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)} className={cellInput}>
        <option value="">—</option>
        {(campo.opzioni ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'numero') {
    return (
      <input
        type="number"
        inputMode="decimal"
        value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={cellInput}
      />
    );
  }
  return (
    <textarea
      rows={2}
      value={typeof valore === 'string' ? valore : ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${cellInput} resize-y`}
    />
  );
}

export default function RapportinoEditor({
  rapportinoId,
  vociIniziali,
  campi,
}: {
  rapportinoId: string;
  vociIniziali: VoceEditabile[];
  campi: TemplateCampo[];
}) {
  const [risposteByVoce, setRisposteByVoce] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(vociIniziali.map((v) => [v.id, { ...(v.risposte ?? {}) }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [stato, setStato] = useState<'idle' | 'salvataggio' | 'ok' | 'errore'>('idle');
  const [errCode, setErrCode] = useState<string>('');

  function setCampo(voceId: string, chiave: string, valore: unknown) {
    setRisposteByVoce((prev) => ({ ...prev, [voceId]: { ...prev[voceId], [chiave]: valore } }));
    setDirty((prev) => new Set(prev).add(voceId));
    setStato('idle');
  }

  async function salva() {
    if (dirty.size === 0 || stato === 'salvataggio') return;
    setStato('salvataggio');
    const payload = {
      rapportinoId,
      voci: Array.from(dirty).map((voceId) => ({ voceId, risposte: risposteByVoce[voceId] })),
    };
    try {
      const res = await fetch('/api/admin/rapportini/voce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDirty(new Set());
      setErrCode('');
      setStato('ok');
    } catch (e) {
      console.error('[RapportinoEditor] salvataggio fallito:', e);
      setErrCode(e instanceof Error ? e.message : '');
      setStato('errore');
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-[var(--brand-surface-muted)]" style={{ color: 'var(--brand-text-muted)' }}>
              <th className={TH}>#</th>
              <th className={TH}>Esito</th>
              <th className={TH}>Intervento</th>
              {campi.map((c) => (
                <th key={c.chiave} className={TH}>{c.etichetta}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vociIniziali.map((v, i) => {
              const risposte = risposteByVoce[v.id] ?? {};
              const b = BADGE[voceEsitoColore(risposte, campi)];
              const nominativo = valoreInfo(v, 'nominativo') || `Voce ${i + 1}`;
              const sotto = (['odl', 'via', 'comune'] as const)
                .map((k) => valoreInfo(v, k))
                .filter(Boolean)
                .join(' · ');
              return (
                <tr key={v.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{i + 1}</td>
                  <td className={TD}>
                    <span
                      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ background: b.bg, color: b.fg }}
                    >
                      {b.label}
                    </span>
                  </td>
                  <td className={TD}>
                    <div className="font-semibold">{nominativo}</div>
                    {sotto && (
                      <div className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>{sotto}</div>
                    )}
                  </td>
                  {campi.map((c) => (
                    <td key={c.chiave} className={`${TD} text-center`}>
                      <CellaCampo campo={c} valore={risposte[c.chiave]} onChange={(val) => setCampo(v.id, c.chiave, val)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salva}
          disabled={dirty.size === 0 || stato === 'salvataggio'}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {stato === 'salvataggio' ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
        {dirty.size > 0 && (
          <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{dirty.size} righe modificate</span>
        )}
        {stato === 'ok' && (
          <span className="text-sm font-semibold" style={{ color: 'var(--success, #166534)' }}>✓ Salvato</span>
        )}
        {stato === 'errore' && (
          <span className="text-sm font-semibold" style={{ color: 'var(--danger, #991b1b)' }}>
            Errore nel salvataggio{errCode ? ` (${errCode})` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
