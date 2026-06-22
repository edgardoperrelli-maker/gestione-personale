'use client';

import Dialog from '@/components/ui/Dialog';
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
      footer={
        <>
          <button type="button" onClick={onInviaComunque} className="rounded-[var(--radius-lg)] border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">
            Invia comunque
          </button>
          <button type="button" onClick={() => onControlla(voci[0].index)} className="flex-1 rounded-[var(--radius-lg)] bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[var(--on-primary)]">
            Controlla foto
          </button>
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
              className="flex w-full items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-left"
            >
              <span aria-hidden className="text-base leading-none">📷</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--brand-text-main)]">
                  <span className="text-[var(--brand-text-muted)]">{v.index + 1}.</span> {v.titolo}
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--brand-text-muted)]">{v.tipi.join(', ')}</span>
              </span>
              <svg viewBox="0 0 24 24" className="mt-1 h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
