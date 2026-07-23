'use client';
import { useEffect, useState } from 'react';
import { Download, Package } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';

type VoceFoto = { voceId: string; via: string | null; odl: string | null; nFoto: number };

/**
 * Scarico delle foto di un rapportino. Sta sul primitivo `Dialog`: prima era un
 * overlay a mano con `bg-black/50` hardcoded, raggio fuori scala e nessun
 * role/aria-modal/focus-trap. Resta montato anche a modale chiusa (`open`) perché
 * Dialog anima l'uscita con AnimatePresence.
 */
export default function ModaleScaricaFoto({
  open,
  rapportinoId,
  etichetta,
  onClose,
}: {
  open: boolean;
  rapportinoId: string | null;
  etichetta: string;
  onClose: () => void;
}) {
  const [voci, setVoci] = useState<VoceFoto[] | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    if (!open || !rapportinoId) return;
    let attivo = true;
    setVoci(null);
    setErrore(false);
    fetch(`/api/admin/rapportini/${rapportinoId}/voci-foto`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => { if (attivo) setVoci(d as VoceFoto[]); })
      .catch(() => { if (attivo) setErrore(true); });
    return () => { attivo = false; };
  }, [open, rapportinoId]);

  const zip = (qs = '') => `/api/admin/rapportini/${rapportinoId}/foto-zip${qs}`;

  return (
    <Dialog open={open} onClose={onClose} title={`Scarica foto — ${etichetta}`}>
      <a
        href={zip()}
        className="mb-4 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-[var(--on-primary)] transition-colors hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-surface)]"
      >
        <Package size={16} aria-hidden />
        Scarica tutte le foto
      </a>

      <div className="mb-1 text-xs font-semibold text-[var(--brand-text-muted)]">Per indirizzo</div>
      {errore && <p className="py-2 text-sm text-[var(--danger)]">Errore nel caricamento.</p>}
      {!voci && !errore && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Caricamento…</p>}
      {voci && voci.length === 0 && <p className="py-2 text-sm text-[var(--brand-text-muted)]">Nessuna foto per indirizzo.</p>}
      {voci && voci.length > 0 && (
        <ul className="divide-y divide-[var(--brand-border)]">
          {voci.map((v) => (
            <li key={v.voceId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-[var(--brand-text-main)]">
                {v.via ?? 'Indirizzo n/d'}{v.odl ? ` · ODL ${v.odl}` : ''}{' '}
                <span className="font-mono tabular-nums text-[var(--brand-text-muted)]">({v.nFoto})</span>
              </span>
              <a
                href={zip(`?voceId=${v.voceId}`)}
                aria-label={`Scarica le foto di ${v.via ?? 'questo indirizzo'}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand-border)] text-[var(--brand-text-muted)] transition-colors hover:border-[var(--brand-border-strong)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                <Download size={15} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
