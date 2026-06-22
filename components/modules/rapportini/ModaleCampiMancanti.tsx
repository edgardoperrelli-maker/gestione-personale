'use client';

import Dialog from '@/components/ui/Dialog';
import type { CampoMancanteVoce } from '@/utils/rapportini/campiObbligatoriVoci';

/**
 * Avviso pre-invio BLOCCANTE: elenca QUALI task e QUALI campi obbligatori mancano.
 * A differenza delle foto, qui non c'è "Invia comunque": l'operatore deve compilarli.
 */
export function ModaleCampiMancanti({
  voci,
  onControlla,
  onChiudi,
}: {
  voci: CampoMancanteVoce[];
  onControlla: (index: number) => void;
  onChiudi: () => void;
}) {
  const totale = voci.reduce((n, v) => n + v.campi.length, 0);
  return (
    <Dialog
      open
      onClose={onChiudi}
      variant="sheet"
      title="Campi obbligatori mancanti"
      footer={
        <button
          type="button"
          onClick={() => onControlla(voci[0].index)}
          className="w-full rounded-[var(--radius-lg)] bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[var(--on-primary)]"
        >
          Vai a compilare
        </button>
      }
    >
      <p className="text-sm text-[var(--brand-text-muted)]">
        Mancano <b>{totale}</b> campi obbligatori su {voci.length} {voci.length === 1 ? 'intervento' : 'interventi'}. Compilali per poter inviare.
      </p>
      <ul className="mt-3 space-y-2">
        {voci.map((v) => (
          <li key={v.index}>
            <button
              type="button"
              onClick={() => onControlla(v.index)}
              className="flex w-full items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--status-ko)]/50 bg-[var(--status-ko-soft)] px-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--brand-text-main)]">
                  <span className="text-[var(--brand-text-muted)]">{v.index + 1}.</span> {v.titolo}
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--brand-text-muted)]">{v.campi.join(', ')}</span>
              </span>
              <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
