'use client';
import { useEffect, useState } from 'react';

type VoceFoto = { voceId: string; via: string | null; odl: string | null; nFoto: number };

export default function ModaleScaricaFoto({
  rapportinoId,
  etichetta,
  onClose,
}: {
  rapportinoId: string;
  etichetta: string;
  onClose: () => void;
}) {
  const [voci, setVoci] = useState<VoceFoto[] | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    let attivo = true;
    fetch(`/api/admin/rapportini/${rapportinoId}/voci-foto`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => { if (attivo) setVoci(d as VoceFoto[]); })
      .catch(() => { if (attivo) setErrore(true); });
    return () => { attivo = false; };
  }, [rapportinoId]);

  const zip = (qs = '') => `/api/admin/rapportini/${rapportinoId}/foto-zip${qs}`;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Scarica foto — {etichetta}</h2>
          <button onClick={onClose} className="text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]">✕</button>
        </div>

        <a
          href={zip()}
          className="mb-3 block rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-center text-sm font-semibold text-[oklch(0.16_0.06_245)]"
        >📦 Scarica tutto</a>

        <div className="mb-1 text-[11px] font-semibold uppercase text-[var(--brand-text-muted)]">Per indirizzo</div>
        {errore && <p className="py-2 text-sm text-[var(--danger)]">Errore nel caricamento.</p>}
        {!voci && !errore && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Caricamento…</p>}
        {voci && voci.length === 0 && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Nessuna foto per indirizzo.</p>}
        {voci && voci.length > 0 && (
          <ul className="divide-y divide-[var(--brand-border)]">
            {voci.map((v) => (
              <li key={v.voceId} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm text-[var(--brand-text-main)]">
                  {v.via ?? 'Indirizzo n/d'}{v.odl ? ` · ODL ${v.odl}` : ''}{' '}
                  <span className="text-[var(--brand-text-muted)]">({v.nFoto})</span>
                </span>
                <a
                  href={zip(`?voceId=${v.voceId}`)}
                  title="Scarica le foto di questo indirizzo"
                  className="shrink-0 rounded-lg border border-[var(--brand-border)] px-3 py-1 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]"
                >⤓</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
