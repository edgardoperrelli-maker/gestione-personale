'use client';

import { useState } from 'react';
import type { RiepilogoRapportino, StatoVoce } from '@/utils/rapportini/riepilogo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { IntestazioneRiepilogo } from './IntestazioneRiepilogo';
import { CondividiPdfButton } from './CondividiPdfButton';
import { rigaMatchRicerca } from '@/utils/rapportini/rigaMatchRicerca';
import type { MotivoIncompleto } from '@/utils/rapportini/voceMancante';

export type RigaVoce = { index: number; titolo: string; sub: string; attivita?: string; fascia?: string; stato: StatoVoce; nuovo?: boolean; annullato?: boolean; nota?: string; badge?: { label: string; tono: 'attesa' | 'rifiutato' } | null; matricola?: string; via?: string; odl?: string };
export type Filtro = 'tutti' | 'dafare' | 'completati';

const CHIP: Record<StatoVoce, { label: string; cls: string }> = {
  eseguito: { label: '✓ Fatto', cls: 'bg-[var(--success-soft)] text-[var(--success)]' },
  non_eseguito: { label: 'Non fatto', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' },
  da_fare: { label: 'Da fare', cls: 'border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-subtle)]' },
};

const FILTRI: [Filtro, string][] = [['tutti', 'Tutti'], ['dafare', 'Da fare'], ['completati', 'Completati']];

const MOTIVO_LABEL: Record<MotivoIncompleto, string> = {
  senza_esito: 'senza esito',
  nota_mancante: 'nota obbligatoria mancante',
};

export function RigaVoceCard({ riga: r, onApri }: { riga: RigaVoce; onApri: (index: number) => void }) {
  const chip = CHIP[r.stato];
  const bordo = r.annullato ? 'border-l-[3px] border-l-[var(--danger)]' : r.stato === 'eseguito' ? 'border-l-[3px] border-l-[var(--success)]' : r.stato === 'non_eseguito' ? 'border-l-[3px] border-l-[var(--danger)]' : '';
  const num = r.annullato ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : r.stato === 'eseguito' ? 'bg-[var(--success-soft)] text-[var(--success)]' : r.stato === 'non_eseguito' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]';
  return (
    <button
      type="button"
      onClick={r.annullato ? undefined : () => onApri(r.index)}
      className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] p-3 text-left transition ${r.annullato ? 'cursor-not-allowed border-[var(--danger)] bg-[var(--danger-soft)]' : 'bg-[var(--brand-surface)] active:border-[var(--brand-primary)]'} ${bordo}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${num}`}>{r.index + 1}</span>
      <span className={`min-w-0 flex-1 ${r.annullato ? 'opacity-70' : ''}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {r.annullato && (
            <span className="shrink-0 rounded-full bg-[var(--danger)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none text-white">
              Annullato
            </span>
          )}
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
          {r.nota && (
            <span title="Nota dall'ufficio" aria-label="Nota dall'ufficio" className="shrink-0 text-[13px] leading-none">📝</span>
          )}
          <span className={`min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--brand-text-main)] ${r.annullato ? 'line-through' : ''}`}>{r.titolo}</span>
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
}

export function RapportinoLista({
  staffName,
  dataLabel,
  dataIso,
  voci,
  campi,
  infoCampi,
  riepilogo,
  righe,
  mancanti,
  filtro,
  onFiltro,
  onApri,
  onInvia,
  inviabile,
  inviando,
  readOnly,
  inviato,
  ricerca = '',
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  riepilogo: RiepilogoRapportino;
  righe: RigaVoce[];
  mancanti: { index: number; titolo: string; motivo: MotivoIncompleto }[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onApri: (index: number) => void;
  onInvia: () => void;
  inviabile: boolean;
  inviando: boolean;
  readOnly: boolean;
  inviato: boolean;
  ricerca?: string;
}) {
  const righeCercate = righe.filter((r) => rigaMatchRicerca(r, ricerca));
  const [tentatoInvio, setTentatoInvio] = useState(false);
  const visibili = righeCercate.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'dafare' ? r.stato === 'da_fare' : r.stato !== 'da_fare',
  );
  const conteggi: Record<Filtro, number> = {
    tutti: righeCercate.length,
    dafare: righeCercate.filter((r) => r.stato === 'da_fare').length,
    completati: righeCercate.filter((r) => r.stato !== 'da_fare').length,
  };

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0 px-3 pt-2">
        <IntestazioneRiepilogo staffName={staffName} dataLabel={dataLabel} riepilogo={riepilogo} />
        <div className="mt-2 flex gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-1">
          {FILTRI.map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => onFiltro(k)}
              className={`flex min-h-[32px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition ${
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
        {ricerca.trim() && (
          <p className="mt-2 px-1 text-xs text-[var(--brand-text-subtle)]">
            {righeCercate.length} risultat{righeCercate.length === 1 ? 'o' : 'i'} per «{ricerca.trim()}»
          </p>
        )}
      </div>

      <div className="rapp-scroll flex-1 space-y-2.5 overflow-y-auto px-3 pb-28 pt-2">
        {visibili.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento in questo filtro.</p>
        ) : (
          visibili.map((r) => <RigaVoceCard key={r.index} riga={r} onApri={onApri} />)
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
              {!readOnly && tentatoInvio && mancanti.length > 0 && (
                <div className="mb-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[var(--danger)]">
                      ⚠️ Non puoi inviare: completa {mancanti.length} {mancanti.length === 1 ? 'intervento' : 'interventi'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setTentatoInvio(false)}
                      aria-label="Chiudi avviso"
                      className="shrink-0 rounded-md px-2 py-0.5 text-sm font-bold leading-none text-[var(--danger)] hover:bg-[var(--danger)]/15"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="max-h-[30vh] space-y-0.5 overflow-y-auto">
                    {mancanti.map((m) => (
                      <button
                        key={m.index}
                        type="button"
                        onClick={() => onApri(m.index)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition hover:bg-[var(--brand-surface)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[var(--brand-text-main)]">
                          <span className="font-bold">Intervento {m.index + 1}</span>
                          {m.titolo ? <span className="text-[var(--brand-text-muted)]"> · {m.titolo}</span> : null}
                        </span>
                        <span className="shrink-0 font-semibold text-[var(--danger)]">{MOTIVO_LABEL[m.motivo]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!readOnly && inviabile && (
                <p className="mb-1.5 text-center text-xs font-medium text-[var(--success)]">Tutti gli interventi hanno un esito ✓</p>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => { if (inviabile) { onInvia(); } else { setTentatoInvio(true); } }}
                  disabled={inviando}
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
