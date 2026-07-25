/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { Camera, ChevronRight } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import type { FotoMancanteVoce } from '@/utils/rapportini/fotoObbligatorieMancanti';

/**
 * Avviso pre-invio: elenca QUALI task e QUALI tipologie di foto obbligatorie mancano.
 * L'operatore può toccare un intervento per andarci e scattarle, oppure inviare comunque.
 */
export function ModaleFotoMancanti({
  voci,
  onControlla,
  onInviaComunque,
  onChiudi,
}: {
  voci: FotoMancanteVoce[];
  onControlla: (index: number) => void;
  onInviaComunque: () => void;
  onChiudi: () => void;
}) {
  const totale = voci.reduce((n, v) => n + v.tipi.length, 0);
  return (
    <Dialog
      open
      onClose={onChiudi}
      variant="sheet"
      title="Foto obbligatorie mancanti"
      className="pb-[env(safe-area-inset-bottom)] sm:pb-0"
      footer={
        <>
          {/* «Invia comunque» resta secondario: non distrugge dati (chiude il rapportino senza
              le foto), ma è la scorciatoia — il primario è andare a scattarle. */}
          <Button size="touch" variant="outline" className="shrink-0" onClick={onInviaComunque}>
            Invia comunque
          </Button>
          <Button size="touch" variant="primary" className="flex-1" onClick={() => onControlla(voci[0].index)}>
            Controlla foto
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--brand-text-muted)]">
        Mancano <b>{totale}</b> foto mai scattate su {voci.length} {voci.length === 1 ? 'intervento' : 'interventi'}. Tocca un intervento per scattarle, oppure invia comunque.
      </p>
      <ul className="mt-3 space-y-2">
        {voci.map((v) => (
          <li key={v.index}>
            <button
              type="button"
              onClick={() => onControlla(v.index)}
              className="flex min-h-[48px] w-full items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2.5 text-left transition active:bg-[var(--warning)]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              {/* Icona di libreria, non emoji: l'emoji la disegna il font di sistema e cambia
                  per versione di Android; così invece prende il token semantico (§7quater). */}
              <Camera aria-hidden className="h-5 w-5 shrink-0 text-[var(--warning)]" strokeWidth={1.6} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--brand-text-main)]">
                  <span className="text-[var(--brand-text-muted)]">{v.index + 1}.</span> {v.titolo}
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--brand-text-muted)]">{v.tipi.join(', ')}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--brand-text-subtle)]" strokeWidth={1.6} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}