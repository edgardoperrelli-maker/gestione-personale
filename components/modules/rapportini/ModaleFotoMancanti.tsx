'use client';

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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--brand-text-main)]">Foto obbligatorie mancanti</h2>
          <button type="button" onClick={onChiudi} className="text-sm font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Mancano <b>{totale}</b> foto mai scattate su {voci.length} {voci.length === 1 ? 'intervento' : 'interventi'}. Tocca un intervento per scattarle, oppure invia comunque.
        </p>
        <ul className="mt-3 space-y-2">
          {voci.map((v) => (
            <li key={v.index}>
              <button
                type="button"
                onClick={() => onControlla(v.index)}
                className="flex w-full items-start gap-2 rounded-xl border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-left"
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
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onInviaComunque} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">
            Invia comunque
          </button>
          <button type="button" onClick={() => onControlla(voci[0].index)} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)]">
            Controlla foto
          </button>
        </div>
      </div>
    </div>
  );
}
