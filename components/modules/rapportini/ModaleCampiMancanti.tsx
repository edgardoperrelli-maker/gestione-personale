/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { ChevronRight } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
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
      className="pb-[env(safe-area-inset-bottom)] sm:pb-0"
      footer={
        <Button size="touch" variant="primary" className="w-full" onClick={() => onControlla(voci[0].index)}>
          Vai a compilare
        </Button>
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
              className="flex min-h-[48px] w-full items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--status-ko)]/50 bg-[var(--status-ko-soft)] px-3 py-2.5 text-left transition active:bg-[var(--status-ko)]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--brand-text-main)]">
                  <span className="text-[var(--brand-text-muted)]">{v.index + 1}.</span> {v.titolo}
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--brand-text-muted)]">{v.campi.join(', ')}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--brand-text-subtle)]" strokeWidth={1.6} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}