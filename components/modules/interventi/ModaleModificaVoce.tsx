// components/modules/interventi/ModaleModificaVoce.tsx
'use client';

import { useEffect, useState } from 'react';
import { ANAGRAFICA_COLONNE, ANAGRAFICA_LABEL } from '@/lib/interventi/storico/modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

type EditorData = {
  anagrafica: Record<string, string | null>;
  risposte: Record<string, unknown>;
  campi: TemplateCampo[];
};

const inputCls =
  'w-full rounded-md border border-[var(--brand-border-strong)] bg-[var(--brand-bg)] px-2 py-1 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

function CampoInput({ campo, valore, onChange }: { campo: TemplateCampo; valore: unknown; onChange: (v: unknown) => void }) {
  if (campo.tipo === 'crocetta') {
    return (
      <input
        type="checkbox"
        checked={valore === true || valore === 'true'}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--brand-primary)]"
        aria-label={campo.etichetta}
      />
    );
  }
  if (campo.tipo === 'select') {
    return (
      <select value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {(campo.opzioni ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
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
        className={inputCls}
      />
    );
  }
  return (
    <textarea rows={2} value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-y`} />
  );
}

export default function ModaleModificaVoce({
  voceId, onClose, onSaved,
}: {
  voceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}`);
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? 'Errore caricamento.');
        }
        const data = (await res.json()) as EditorData;
        if (!alive) return;
        const a: Record<string, string> = {};
        for (const k of ANAGRAFICA_COLONNE) a[k] = (data.anagrafica?.[k] ?? '') as string;
        setAnagrafica(a);
        setRisposte({ ...(data.risposte ?? {}) });
        setCampi(Array.isArray(data.campi) ? data.campi : []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Errore caricamento.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [voceId]);

  const salva = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anagrafica, risposte }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Errore salvataggio.');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--brand-text-main)]">Modifica intervento</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="rounded-lg px-2 py-1 text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]">✕</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento…
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Anagrafica</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {ANAGRAFICA_COLONNE.map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">{ANAGRAFICA_LABEL[k]}</span>
                    <input
                      className={inputCls}
                      value={anagrafica[k] ?? ''}
                      onChange={(e) => setAnagrafica((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </section>

            {campi.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Esiti / risposte</h3>
                <div className="space-y-3">
                  {campi.map((c) => (
                    <label key={c.chiave} className="flex items-start gap-3">
                      <span className="mt-1 w-40 shrink-0 text-sm text-[var(--brand-text-main)]">{c.etichetta}</span>
                      <span className="flex-1">
                        <CampoInput campo={c} valore={risposte[c.chiave]} onChange={(v) => setRisposte((p) => ({ ...p, [c.chiave]: v }))} />
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {error && (
              <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">{error}</div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-main)] disabled:opacity-60">Annulla</button>
              <button type="button" onClick={salva} disabled={saving} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Salvataggio…' : 'Salva'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
