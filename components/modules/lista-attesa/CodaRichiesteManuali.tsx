'use client';

import { useState } from 'react';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PannelloRevisioneRichiesta } from './PannelloRevisioneRichiesta';
import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';
import { statoPresaInCarico } from '@/lib/interventi/manuali/etichettaPresaInCarico';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
import { formatDataIt } from '@/lib/interventi/manuali/formatDataIt';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export function CodaRichiesteManuali({
  infoCampi,
  campiPerCommittente,
  userId,
  adminNomi,
}: {
  infoCampi: TemplateInfoCampo[];
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  userId: string;
  adminNomi: Record<string, string>;
}) {
  const { richieste, count, live, refresh } = useRichiesteManualiFeed();
  const [aperta, setAperta] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const prendi = async (id: string, override = false) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/prendi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override }),
      });
      await refresh();
    } finally { setBusyId(null); }
  };
  const rilascia = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/rilascia`, { method: 'POST' });
      await refresh();
    } finally { setBusyId(null); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--brand-text-main)]">
          Richieste manuali · in attesa ({count})
          <span
            className={`ml-2 inline-block h-2 w-2 rounded-full align-middle ${live ? 'bg-[var(--success)]' : 'bg-[var(--brand-text-muted)]'}`}
            title={live ? 'Realtime attivo' : 'Realtime non attivo (polling)'}
          />
        </h2>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-muted)]">
          Aggiorna
        </button>
      </div>
      {richieste.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => {
            const presa = statoPresaInCarico(r.preso_in_carico_da, userId, adminNomi);
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <button type="button" onClick={() => setAperta((a) => (a === r.id ? null : r.id))} className="flex items-center gap-2 text-left">
                    <span className="text-sm font-semibold text-[var(--brand-text-main)]">{r.staff_name ?? r.staff_id} · {etichettaCommittente(r.committente)}</span>
                    <span className="text-xs text-[var(--brand-text-muted)]">{formatDataIt(r.data)}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {presa.etichetta && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${presa.miaPresa ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]'}`}>
                        {presa.etichetta}
                      </span>
                    )}
                    {presa.mostraPrendi && (
                      <button type="button" disabled={busy} onClick={() => void prendi(r.id)} className="rounded-lg bg-[var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">Prendi</button>
                    )}
                    {presa.mostraRilascia && (
                      <button type="button" disabled={busy} onClick={() => void rilascia(r.id)} className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-text-muted)] disabled:opacity-50">Rilascia</button>
                    )}
                    {presa.mostraOverride && (
                      <button type="button" disabled={busy} onClick={() => void prendi(r.id, true)} className="rounded-lg border border-[var(--danger)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)] disabled:opacity-50">Override</button>
                    )}
                  </div>
                </div>
                {aperta === r.id && (
                  <div className="px-3 pb-3">
                    <PannelloRevisioneRichiesta
                      riga={r}
                      infoCampi={infoCampi}
                      campiEsito={campiPerCommittente[r.committente] ?? []}
                      onDecisa={() => { setAperta(null); void refresh(); }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
