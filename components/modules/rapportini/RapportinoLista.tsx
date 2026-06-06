'use client';

import type { RiepilogoRapportino, StatoVoce } from '@/utils/rapportini/riepilogo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { IntestazioneRiepilogo } from './IntestazioneRiepilogo';
import { CondividiPdfButton } from './CondividiPdfButton';

export type RigaVoce = { index: number; titolo: string; sub: string; attivita?: string; fascia?: string; stato: StatoVoce; nuovo?: boolean; badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null };
export type Filtro = 'tutti' | 'dafare' | 'completati';

const CHIP: Record<StatoVoce, { label: string; cls: string }> = {
  eseguito: { label: '✓ Fatto', cls: 'bg-[var(--success-soft)] text-[var(--success)]' },
  non_eseguito: { label: 'Non fatto', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' },
  da_fare: { label: 'Da fare', cls: 'border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-subtle)]' },
};

const FILTRI: [Filtro, string][] = [['tutti', 'Tutti'], ['dafare', 'Da fare'], ['completati', 'Completati']];

export function RapportinoLista({
  staffName,
  dataLabel,
  dataIso,
  voci,
  campi,
  infoCampi,
  riepilogo,
  righe,
  filtro,
  onFiltro,
  onApri,
  onInvia,
  inviabile,
  inviando,
  readOnly,
  inviato,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  riepilogo: RiepilogoRapportino;
  righe: RigaVoce[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onApri: (index: number) => void;
  onInvia: () => void;
  inviabile: boolean;
  inviando: boolean;
  readOnly: boolean;
  inviato: boolean;
}) {
  const visibili = righe.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );
  const conteggi: Record<Filtro, number> = {
    tutti: righe.length,
    dafare: righe.filter((r) => r.stato === 'da_fare').length,
    completati: righe.filter((r) => r.stato !== 'da_fare').length,
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0 px-3 pt-3">
        <IntestazioneRiepilogo staffName={staffName} dataLabel={dataLabel} riepilogo={riepilogo} />
        <div className="mt-3 flex gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-1">
          {FILTRI.map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => onFiltro(k)}
              className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition ${
                filtro === k ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'text-[var(--brand-text-muted)]'
              }`}
            >
              <span>{lbl}</span>
              <span
                className={`min-w-[1.25rem] rounded-full px-1 text-xs font-bold tabular-nums ${
                  filtro === k ? 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]' : 'bg-[var(--brand-surface)] text-[var(--brand-text-subtle)]'
                }`}
              >
                {conteggi[k]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rapp-scroll flex-1 space-y-2.5 overflow-y-auto px-3 pb-28 pt-2">
        {visibili.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento in questo filtro.</p>
        ) : (
          visibili.map((r) => {
            const chip = CHIP[r.stato];
            const bordo = r.stato === 'eseguito' ? 'border-l-[3px] border-l-[var(--success)]' : r.stato === 'non_eseguito' ? 'border-l-[3px] border-l-[var(--danger)]' : '';
            const num = r.stato === 'eseguito' ? 'bg-[var(--success-soft)] text-[var(--success)]' : r.stato === 'non_eseguito' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]';
            return (
              <button
                key={r.index}
                type="button"
                onClick={() => onApri(r.index)}
                className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-left transition active:border-[var(--brand-primary)] ${bordo}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${num}`}>{r.index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {r.nuovo && (
                      <span className="shrink-0 rounded-full bg-[var(--brand-gold)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none text-[oklch(0.16_0.06_245)]">
                        Nuovo
                      </span>
                    )}
                    {r.badge && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none ${r.badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
                        {r.badge.label}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--brand-text-main)]">{r.titolo}</span>
                    {(r.attivita || r.fascia) && (
                      <span className="shrink-0 whitespace-nowrap text-[11.5px] font-medium text-[var(--brand-text-muted)]">
                        {[r.attivita, r.fascia].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--brand-text-muted)]">{r.sub}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                  </span>
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            );
          })
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-[480px] border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          {inviato ? (
            <>
              <p className="mb-1.5 text-center text-xs font-medium text-[var(--success)]">Rapportino inviato ✓</p>
              <CondividiPdfButton
                staffName={staffName}
                dataLabel={dataLabel}
                dataIso={dataIso}
                voci={voci}
                campi={campi}
                infoCampi={infoCampi}
              />
            </>
          ) : (
            <>
              {!readOnly && inviabile && (
                <p className="mb-1.5 text-center text-xs font-medium text-[var(--success)]">Tutti gli interventi hanno un esito ✓</p>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={onInvia}
                  disabled={!inviabile || inviando}
                  className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[oklch(0.16_0.06_245)] shadow-sm transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                >
                  {inviando ? 'Invio in corso…' : 'Invia rapportino'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
