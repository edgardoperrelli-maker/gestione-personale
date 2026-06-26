'use client';

import { useCallback, useEffect, useState } from 'react';
import ModalePIManuale from './ModalePIManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { ReperibileRef } from '@/lib/pi/types';

type Riga = {
  id: string;
  staff_name: string | null;
  data: string | null;
  stato: string;
  anomalia_reperibilita: boolean;
  dati_correnti: { anagrafica?: Record<string, unknown> } | null;
};

type Payload = {
  token: { area_codice: string; valido_dal: string; valido_al: string; note: string | null; statoCalcolato: string };
  area: { codice: string; label: string } | null;
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  reperibili: Record<string, ReperibileRef[]>;
  righe: Riga[];
};

const STATO_LABEL: Record<string, string> = {
  in_attesa: 'In attesa',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  annullato: 'Annullato',
};

function fmtData(d: string | null): string {
  if (!d) return '';
  const [y, m, g] = d.split('-');
  return `${g}/${m}/${y}`;
}

export default function PILinkClient({ token }: { token: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [modale, setModale] = useState(false);

  const carica = useCallback(async () => {
    const res = await fetch(`/api/pi/${token}`, { cache: 'no-store' });
    if (res.ok) setPayload(await res.json());
    setCaricamento(false);
  }, [token]);

  useEffect(() => { void carica(); }, [carica]);

  const valido = payload?.token.statoCalcolato === 'valido';

  return (
    <main className="min-h-screen bg-[var(--brand-bg)] px-4 py-6 text-[var(--brand-text-main)]">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-4">
          <h1 className="text-xl font-semibold">Pronto Intervento{payload?.area ? ` · ${payload.area.label}` : ''}</h1>
          {payload && (
            <p className="text-sm text-[var(--brand-text-muted)]">
              Validità {fmtData(payload.token.valido_dal)} – {fmtData(payload.token.valido_al)}
              {payload.token.note ? ` · ${payload.token.note}` : ''}
            </p>
          )}
        </header>

        {!valido && payload && (
          <div className="mb-4 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3 text-sm text-[var(--warning)]">
            {payload.token.statoCalcolato === 'non_attivo' && 'Link non ancora attivo.'}
            {payload.token.statoCalcolato === 'scaduto' && 'Link scaduto: non è più possibile inserire chiamate.'}
            {payload.token.statoCalcolato === 'revocato' && 'Link revocato dall’ufficio.'}
          </div>
        )}

        {caricamento && <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>}

        {payload && payload.righe.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--brand-border)] p-8 text-center text-sm text-[var(--brand-text-muted)]">
            Nessuna chiamata registrata. Premi “+” per aggiungerne una.
          </div>
        )}

        <ul className="space-y-2">
          {payload?.righe.map((r) => {
            const ana = (r.dati_correnti?.anagrafica ?? {}) as Record<string, unknown>;
            const indirizzo = [ana.via, ana.comune].filter(Boolean).join(' · ');
            return (
              <li key={r.id} className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{indirizzo || '—'}</div>
                    <div className="text-xs text-[var(--brand-text-muted)]">{fmtData(r.data)} · {r.staff_name ?? '—'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full bg-[var(--brand-surface-muted)] px-2 py-0.5 text-xs font-medium">{STATO_LABEL[r.stato] ?? r.stato}</span>
                    {r.anomalia_reperibilita && (
                      <span className="rounded-full bg-[var(--danger-soft,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">anomalia reperibilità</span>
                    )}
                  </div>
                </div>
                {r.stato === 'in_attesa' && (
                  <button
                    type="button"
                    onClick={async () => { await fetch(`/api/pi/${token}/intervento/${r.id}/annulla`, { method: 'POST' }); void carica(); }}
                    className="mt-2 text-xs font-medium text-[var(--danger)] underline"
                  >
                    Annulla
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {valido && (
        <button
          type="button"
          aria-label="Aggiungi chiamata"
          onClick={() => setModale(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[var(--brand-primary)] text-2xl font-bold text-[var(--on-primary)] shadow-lg"
        >
          +
        </button>
      )}

      {modale && payload && (
        <ModalePIManuale
          token={token}
          campi={payload.campi}
          infoCampi={payload.infoCampi}
          reperibili={payload.reperibili}
          onClose={() => setModale(false)}
          onSaved={() => { setModale(false); void carica(); }}
        />
      )}
    </main>
  );
}
