'use client';

import { type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { SaveBadge, type SaveState } from './SaveBadge';
import { VoceCard, type VoceCardData } from './VoceCard';
import type { NotaPrecedente } from '@/lib/interventi/notePrecedenti';

export type VoceFocusData = VoceCardData;

export function VoceFocus({
  voce, indice, totale, campi, dettaglio, titoloCampi, disabilitato, stato, saveState,
  onChange, onPrev, onNext, onClose, approvazioneStato, motivoRifiuto, notaUfficio, notePrecedenti,
}: {
  voce: VoceFocusData;
  indice: number;
  totale: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  disabilitato: boolean;
  stato: StatoVoce;
  saveState: SaveState;
  onChange: (chiave: string, valore: unknown) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  approvazioneStato?: string | null;
  motivoRifiuto?: string | null;
  notaUfficio?: string | null;
  notePrecedenti?: NotaPrecedente[] | null;
}) {
  const isFirst = indice === 0;
  const isLast = indice === totale - 1;

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} className="-ml-1 inline-flex min-h-[40px] items-center gap-1.5 px-1 py-1.5 text-sm font-semibold text-[var(--brand-primary)]">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 18l-6-6 6-6" /></svg>
          Tutti gli interventi
        </button>
        <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1 text-[13px] font-bold text-[var(--brand-text-muted)]">{indice + 1} / {totale}</span>
      </div>

      <div className="rapp-scroll flex-1 overflow-y-auto px-3 pb-28">
        <VoceCard
          voce={voce}
          indice={indice}
          campi={campi}
          dettaglio={dettaglio}
          titoloCampi={titoloCampi}
          stato={stato}
          disabilitato={disabilitato}
          onChange={onChange}
          headerRight={<SaveBadge state={saveState} />}
          approvazioneStato={approvazioneStato}
          motivoRifiuto={motivoRifiuto}
          notaUfficio={notaUfficio}
          notePrecedenti={notePrecedenti}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-2.5 border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <button type="button" onClick={onPrev} disabled={isFirst} className="shrink-0 rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-40">‹</button>
          <button type="button" onClick={onNext} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[var(--on-primary)] shadow-sm transition hover:bg-[var(--brand-primary-hover)]">
            {disabilitato ? (isLast ? 'Torna alla lista' : 'Avanti ›') : isLast ? 'Salva e torna alla lista' : 'Salva e avanti ›'}
          </button>
        </div>
      </div>
    </div>
  );
}
