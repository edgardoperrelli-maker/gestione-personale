/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/Button';
import { type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { SaveBadge, type SaveState } from './SaveBadge';
import { VoceCard, type VoceCardData } from './VoceCard';
import type { NotaPrecedente } from '@/lib/interventi/notePrecedenti';

export type VoceFocusData = VoceCardData;

export function VoceFocus({
  voce, indice, totale, campi, dettaglio, titoloCampi, disabilitato, stato, saveState,
  onChange, onPrev, onNext, onClose, approvazioneStato, motivoRifiuto, notaUfficio, top,
  notePrecedenti,
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
  /** Ordine segnalato TOP da ACEA: si inoltra alla card, che ci mette il banner. */
  top?: boolean;
  notePrecedenti?: NotaPrecedente[] | null;
}) {
  const isFirst = indice === 0;
  const isLast = indice === totale - 1;

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} className="-ml-1 inline-flex min-h-[48px] items-center gap-1.5 rounded-[var(--radius-md)] px-1 py-1.5 text-sm font-semibold text-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
          <ChevronLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
          Tutti gli interventi
        </button>
        <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1 font-mono text-[13px] font-semibold tabular-nums text-[var(--brand-text-muted)]">{indice + 1} / {totale}</span>
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
          top={top}
          notePrecedenti={notePrecedenti}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-2.5 border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
          <Button variant="outline" size="touch" onClick={onPrev} disabled={isFirst} aria-label="Voce precedente" className="shrink-0">
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          </Button>
          {/* Il verso "avanti" lo porta l'icona, non un `›` dentro la stringa: così resta
              coerente con il ChevronLeft qui a fianco e sparisce quando il passo è l'ultimo
              (dove non si va avanti, si torna alla lista). */}
          <Button variant="primary" size="touch" onClick={onNext} className="flex-1 shadow-[var(--shadow-sm)]">
            {disabilitato ? (isLast ? 'Torna alla lista' : 'Avanti') : isLast ? 'Salva e torna alla lista' : 'Salva e avanti'}
            {!isLast && <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}