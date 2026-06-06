'use client';

import { useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from './CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import type { CommittenteManuale, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'altro', label: 'Altro' },
];

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none';

export function ModaleInterventoManuale({
  token,
  infoCampi,
  campiPerCommittente,
  onClose,
  onCreata,
}: {
  token: string;
  infoCampi: TemplateInfoCampo[];
  /** Campi esito (template) per committente; se non noto si usa []. */
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  onClose: () => void;
  onCreata: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);
  const campiEsito = committente ? campiPerCommittente[committente] ?? [] : [];

  const invia = async () => {
    if (!committente) return;
    setInviando(true);
    setErrore(null);
    try {
      const payload: DatiInterventoManuale = { committente, anagrafica, risposte };
      const res = await fetch(`/api/r/${token}/intervento-manuale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onCreata();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--brand-text-main)]">Nuovo intervento</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Committente</p>
            <div className="grid grid-cols-3 gap-2">
              {COMMITTENTI.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCommittente(c.value); setStep(2); }}
                  className={`min-h-[50px] rounded-xl border p-3 text-sm font-semibold transition ${
                    committente === c.value
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                      : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {campiAnag.map((c) => (
              <div key={c.chiave}>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
                <input
                  type="text"
                  value={anagrafica[c.chiave] ?? ''}
                  onChange={(e) => setAnagrafica((prev) => ({ ...prev, [c.chiave]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">Indietro</button>
              <button type="button" onClick={() => setStep(3)} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)]">Avanti</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3.5">
            {campiEsito.length === 0 && (
              <p className="text-sm text-[var(--brand-text-muted)]">Nessun campo esito per questo committente: la richiesta verrà inviata per approvazione.</p>
            )}
            {campiEsito.map((campo) => (
              <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={inviando} onChange={(v) => setRisposte((prev) => ({ ...prev, [campo.chiave]: v }))} />
            ))}
            {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(2)} disabled={inviando} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-50">Indietro</button>
              <button type="button" onClick={invia} disabled={inviando} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">
                {inviando ? 'Invio…' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
