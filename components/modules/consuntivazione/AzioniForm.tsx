'use client';

import { useCallback, useMemo } from 'react';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { RapportinoFotoCtx } from '@/components/modules/rapportini/RapportinoFotoCtx';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { slotFotoCondizionali, fotoSlotObbligatorio } from '@/utils/rapportini/fotoCondizionali';
import { statoEsitoConsuntivo, notaNegativoMancante, type StatoEsitoConsuntivo } from '@/lib/consuntivazione/statoEsito';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const ESITO_META: Record<StatoEsitoConsuntivo, { label: string; token: string }> = {
  positivo: { label: 'Positivo', token: 'ok' },
  negativo: { label: 'Negativo', token: 'ko' },
  da_esitare: { label: 'Da esitare', token: 'idle' },
};

/** Renderizza le azioni del flusso (motore Azioni operatori) e mostra l'esito calcolato live. */
export default function AzioniForm({
  campi,
  risposte,
  onChange,
  rapId,
  disabilitato = false,
}: {
  campi: TemplateCampo[];
  risposte: Record<string, unknown>;
  onChange: (risposte: Record<string, unknown>) => void;
  rapId: string;
  disabilitato?: boolean;
}) {
  const ordinati = useMemo(() => [...campi].sort((a, b) => a.ordine - b.ordine), [campi]);

  // Upload foto admin: stesso bucket/convenzione dell'operatore, endpoint admin con rapId.
  const uploadFoto = useCallback(
    async (chiave: string, file: File): Promise<string | null> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('rapId', rapId);
      fd.append('clientKey', chiave); // una foto per slot (ricattura = sovrascrive)
      try {
        const res = await fetch('/api/admin/consuntivazione/foto', { method: 'POST', body: fd });
        if (!res.ok) return null;
        const j = (await res.json()) as { path?: string };
        return j.path ?? null;
      } catch {
        return null;
      }
    },
    [rapId],
  );

  const stato = statoEsitoConsuntivo(risposte, campi);
  const negativo = haEsitoNegativo(risposte, campi);
  const meta = ESITO_META[stato];

  // Foto obbligatorie mancanti (feedback pre-invio; il server resta autorevole).
  const condizionali = slotFotoCondizionali(campi, risposte);
  const fotoMancanti = negativo
    ? []
    : ordinati
        .filter((c) => c.tipo === 'foto' && fotoSlotObbligatorio(c, condizionali))
        .filter((c) => {
          const v = risposte[c.chiave];
          return !(typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0);
        })
        .map((c) => c.etichetta);

  const set = (chiave: string, valore: unknown) => onChange({ ...risposte, [chiave]: valore });

  return (
    <RapportinoFotoCtx.Provider value={uploadFoto}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[var(--brand-text-main)]">Esitazione</h3>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: `var(--status-${meta.token}-soft)`,
              color: `var(--status-${meta.token})`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--status-${meta.token})` }} />
            {meta.label}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {ordinati.map((campo) => (
            <div key={campo.chiave} className={campo.tipo === 'foto' || campo.tipo === 'testo' ? 'sm:col-span-2' : ''}>
              <CampoInput
                campo={campo}
                valore={risposte[campo.chiave]}
                disabilitato={disabilitato}
                onChange={(v) => set(campo.chiave, v)}
              />
            </div>
          ))}
        </div>

        {fotoMancanti.length > 0 && (
          <p className="text-xs text-[var(--status-warn)]">
            Foto obbligatorie mancanti: {fotoMancanti.join(', ')}.
          </p>
        )}

        {notaNegativoMancante(risposte, campi) && (
          <p className="text-xs text-[var(--status-warn)]">
            Per l&apos;esito negativo inserisci la nota col motivo.
          </p>
        )}
      </div>
    </RapportinoFotoCtx.Provider>
  );
}
