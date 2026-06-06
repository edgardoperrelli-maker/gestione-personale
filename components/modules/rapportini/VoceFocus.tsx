'use client';

import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { SaveBadge, type SaveState } from './SaveBadge';
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';

export type VoceFocusData = VoceInfo & { risposte: Record<string, unknown> };

export function VoceFocus({
  voce,
  indice,
  totale,
  campi,
  dettaglio,
  titoloCampi,
  disabilitato,
  stato,
  saveState,
  onChange,
  onPrev,
  onNext,
  onClose,
  approvazioneStato,
  motivoRifiuto,
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
}) {
  const badge = badgeVoceManuale(approvazioneStato ?? null);
  const titolo = titoloVoce(voce, titoloCampi, indice);
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const dett = dettaglio
    .filter((c) => c.chiave !== 'coordinate')
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  const bordo = stato === 'eseguito' ? 'border-[var(--success)]' : stato === 'non_eseguito' ? 'border-[var(--danger)]' : 'border-[var(--brand-border)]';
  const isFirst = indice === 0;
  const isLast = indice === totale - 1;

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 py-1.5 text-sm font-semibold text-[var(--brand-primary)]">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 18l-6-6 6-6" /></svg>
          Tutti gli interventi
        </button>
        <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1 text-[13px] font-bold text-[var(--brand-text-muted)]">{indice + 1} / {totale}</span>
      </div>

      <div className="rapp-scroll flex-1 overflow-y-auto px-3 pb-28">
        <section className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-[var(--brand-text-main)]">{titolo}</h1>
            <SaveBadge state={saveState} />
          </div>
          {badge && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--danger-soft)] text-[var(--danger)]'}`}>
              {badge.label}
              {badge.tono === 'attesa' && ' — in attesa di approvazione dalla centrale'}
              {badge.tono === 'rifiutato' && motivoRifiuto ? ` · ${motivoRifiuto}` : ''}
            </div>
          )}

          <div className="mt-2.5 space-y-1.5 text-[14.5px] text-[var(--brand-text-main)]">
            {indirizzo && (
              <a
                href={mapsUrlFromAddress(valoreInfo(voce, 'via'), valoreInfo(voce, 'comune'), valoreInfo(voce, 'cap'))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span>{indirizzo}</span>
              </a>
            )}
            {coordinataAbilitata && coordinata && (
              <a
                href={mapsUrlFromCoordinate(coordinata)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>
                <span>Punto esatto · {coordinata}</span>
              </a>
            )}
            {fascia && (
              <div className="flex items-center gap-2">
                <svg className="h-[17px] w-[17px] shrink-0 text-[var(--brand-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span>{fascia}</span>
              </div>
            )}
          </div>

          {dett.length > 0 && (
            <details className="group mt-3.5 overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
              <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] font-semibold text-[var(--brand-text-muted)] [&::-webkit-details-marker]:hidden">
                Dettagli anagrafici
                <svg className="h-[18px] w-[18px] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 pt-1">
                {dett.map((r) => (
                  <div key={r.label} className="min-w-0">
                    <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">{r.label}</dt>
                    <dd className="mt-0.5 break-words text-sm text-[var(--brand-text-main)]">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          <div className="mt-4 space-y-3.5">
            {altri.map((campo) => (
              <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} />
            ))}
            {crocette.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Lavorazioni</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {crocette.map((campo) => (
                    <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto flex max-w-[480px] items-center gap-2.5 border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <button type="button" onClick={onPrev} disabled={isFirst} className="shrink-0 rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)] disabled:opacity-40">‹</button>
          <button type="button" onClick={onNext} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[oklch(0.16_0.06_245)] shadow-sm transition hover:bg-[var(--brand-primary-hover)]">
            {disabilitato ? (isLast ? 'Torna alla lista' : 'Avanti ›') : isLast ? 'Salva e torna alla lista' : 'Salva e avanti ›'}
          </button>
        </div>
      </div>
    </div>
  );
}
