'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PannelloRevisioneRichiesta } from './PannelloRevisioneRichiesta';
import type { RigaRichiesta, CommittenteManuale } from '@/lib/interventi/manuali/types';

export function CodaRichiesteManuali({
  infoCampi,
  campiPerCommittente,
}: {
  infoCampi: TemplateInfoCampo[];
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
}) {
  const [richieste, setRichieste] = useState<RigaRichiesta[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricando(true);
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=in_attesa', { cache: 'no-store' });
      if (res.ok) {
        const j = (await res.json()) as { richieste: RigaRichiesta[] };
        setRichieste(j.richieste ?? []);
      }
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--brand-text-main)]">Richieste manuali · in attesa ({richieste.length})</h2>
        <button type="button" onClick={() => void carica()} disabled={caricando} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-muted)] disabled:opacity-50">
          {caricando ? 'Aggiorno…' : 'Aggiorna'}
        </button>
      </div>
      {richieste.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => (
            <li key={r.id} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
              <button type="button" onClick={() => setAperta((a) => (a === r.id ? null : r.id))} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <span className="text-sm font-semibold text-[var(--brand-text-main)]">{r.staff_name ?? r.staff_id} · {r.committente}</span>
                <span className="text-xs text-[var(--brand-text-muted)]">{r.data}</span>
              </button>
              {aperta === r.id && (
                <div className="px-3 pb-3">
                  <PannelloRevisioneRichiesta
                    riga={r}
                    infoCampi={infoCampi}
                    campiEsito={campiPerCommittente[r.committente] ?? []}
                    onDecisa={() => { setAperta(null); void carica(); }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
