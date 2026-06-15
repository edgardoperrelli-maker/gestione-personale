'use client';

import { useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from './CampoInput';
import { CampoFoto } from './CampoFoto';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import type { CommittenteManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
import { messaggioErroreManuale } from '@/lib/interventi/manuali/messaggioErroreManuale';
import { CercaMatricolaLimitazione } from './limitazione/CercaMatricolaLimitazione';
import { autofillAnagrafica } from '@/lib/limitazione/autofillAnagrafica';
import type { VoceMatricola } from '@/lib/limitazione/matchVociMatricola';

const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'lim_massive', label: 'Limitazioni massive' },
  { value: 'altro', label: 'Altro' },
];

export function ModaleInterventoManuale({
  token,
  infoCampi,
  campiPerCommittente,
  voci,
  onApriAssegnato,
  onClose,
  onCreata,
}: {
  token: string;
  infoCampi: TemplateInfoCampo[];
  /** Campi esito (template) per committente; se non noto si usa []. */
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  voci: VoceMatricola[];
  onApriAssegnato: (voceId: string) => void;
  onClose: () => void;
  onCreata: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [foto, setFoto] = useState<Record<string, File>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [cercaFatta, setCercaFatta] = useState(false);

  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);
  const campiEsito = committente ? campiPerCommittente[committente] ?? [] : [];

  // Slot foto del template selezionato e validazione obbligatorie
  const slotFoto = campiFoto(campiEsito);
  const esitoFoto = haEsitoNegativo(risposte, campiEsito)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(
        campiEsito,
        Object.fromEntries(slotFoto.map((c) => [c.chiave, foto[c.chiave] != null])),
      );

  const handleInvia = async () => {
    if (!committente) return;
    const mancanti = campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0 && !window.confirm(`Mancano ${mancanti.length} campi obbligatori da compilare: ${mancanti.join(', ')}. Inviare comunque?`)) {
      return;
    }
    setInviando(true);
    setErrore(null);
    try {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({ committente, anagrafica, risposte }));
      for (const c of slotFoto) {
        const f = foto[c.chiave];
        if (f) fd.append(`foto:${c.chiave}`, f, f.name);
      }
      const res = await fetch(`/api/r/${token}/intervento-manuale`, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; dettaglio?: string; mancanti?: string[] };
        throw new Error(messaggioErroreManuale(j, res.status));
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
            <div className="grid grid-cols-2 gap-2">
              {COMMITTENTI.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCommittente(c.value); setStep(2); setCercaFatta(false); }}
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

        {step === 2 && committente === 'lim_massive' && !cercaFatta && (
          <CercaMatricolaLimitazione
            token={token}
            voci={voci}
            onTrovato={(m) => { setAnagrafica((prev) => ({ ...prev, ...autofillAnagrafica(m) })); setCercaFatta(true); }}
            onManuale={(matricola) => { setAnagrafica((prev) => ({ ...prev, matricola })); setCercaFatta(true); }}
            onApriAssegnato={onApriAssegnato}
            onIndietro={() => setStep(1)}
          />
        )}

        {step === 2 && !(committente === 'lim_massive' && !cercaFatta) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              {campiAnag.map((c) => (
                <div key={c.chiave} className="min-w-0">
                  <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
                  <input
                    type="text"
                    value={anagrafica[c.chiave] ?? ''}
                    onChange={(e) => setAnagrafica((prev) => ({ ...prev, [c.chiave]: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-1.5 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>
              ))}
            </div>
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
            {campiEsito.filter((c) => c.tipo !== 'foto').map((campo) => (
              <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={inviando} onChange={(v) => setRisposte((prev) => ({ ...prev, [campo.chiave]: v }))} />
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(2)} disabled={inviando} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-50">Indietro</button>
              <button type="button" onClick={() => setStep(4)} disabled={inviando} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">Avanti</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--brand-text-muted)]">
              Carica le foto richieste. Quelle contrassegnate come <b>obbligatorie</b> servono per inviare la richiesta.
            </p>
            {slotFoto.length === 0 && (
              <p className="text-sm text-[var(--brand-text-muted)]">Questo template non richiede foto.</p>
            )}
            {slotFoto.map((c) => (
              <CampoFoto
                key={c.chiave}
                campo={c}
                file={foto[c.chiave] ?? null}
                disabilitato={inviando}
                onChange={(f) =>
                  setFoto((prev) => {
                    const next = { ...prev };
                    if (f) next[c.chiave] = f;
                    else delete next[c.chiave];
                    return next;
                  })
                }
              />
            ))}
            {!esitoFoto.ok && (
              <p className="text-xs font-medium text-[var(--danger)]">
                Mancano: {esitoFoto.mancanti.join(', ')}
              </p>
            )}
            {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setStep(3)} disabled={inviando} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-50">Indietro</button>
              <button
                type="button"
                disabled={inviando || !esitoFoto.ok}
                onClick={handleInvia}
                className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50"
              >
                {inviando ? 'Invio…' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
