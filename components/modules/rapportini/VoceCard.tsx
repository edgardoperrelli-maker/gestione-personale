'use client';

import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';
import { motivoVoceIncompleta, isCampoNota } from '@/utils/rapportini/voceMancante';

export type VoceCardData = VoceInfo & { risposte: Record<string, unknown> };

/** Titolo della voce. */
export function VoceTitolo({ voce, titoloCampi, indice }: { voce: VoceCardData; titoloCampi: InfoChiave[]; indice: number }) {
  return <h1 className="text-xl font-bold text-[var(--brand-text-main)]">{titoloVoce(voce, titoloCampi, indice)}</h1>;
}

/** Header: indirizzo (link Maps) + "Punto esatto" (se abilitato) + fascia. */
export function VoceHeaderInfo({ voce, coordinataAbilitata }: { voce: VoceCardData; coordinataAbilitata: boolean }) {
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  return (
    <div className="mt-2.5 space-y-1.5 text-sm text-[var(--brand-text-main)]">
      {indirizzo && (
        <a href={mapsUrlFromAddress(valoreInfo(voce, 'via'), valoreInfo(voce, 'comune'), valoreInfo(voce, 'cap'))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
          <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
          <span>{indirizzo}</span>
        </a>
      )}
      {coordinataAbilitata && coordinata && (
        <a href={mapsUrlFromCoordinate(coordinata)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
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
  );
}

/** "Dettagli anagrafici" (esclude la coordinata, che è nell'header). */
export function VoceDettagli({ voce, dettaglio }: { voce: VoceCardData; dettaglio: TemplateInfoCampo[] }) {
  const dett = dettaglio
    .filter((c) => c.chiave !== 'coordinate')
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
  if (dett.length === 0) return null;
  return (
    <details className="group mt-3.5 overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
      <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold text-[var(--brand-text-muted)] [&::-webkit-details-marker]:hidden">
        Dettagli anagrafici
        <svg className="h-[18px] w-[18px] transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 pt-1">
        {dett.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">{r.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-[var(--brand-text-main)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Campi da compilare: campi "altri" + crocette "Lavorazioni". */
export function VoceCampi({ campi, voce, disabilitato, onChange, evidenziaNota }: { campi: TemplateCampo[]; voce: VoceCardData; disabilitato: boolean; onChange: (chiave: string, valore: unknown) => void; evidenziaNota?: boolean }) {
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  return (
    <div className="mt-4 space-y-3.5">
      {altri.map((campo) => (
        <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} evidenzia={Boolean(evidenziaNota) && isCampoNota(campo)} />
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
  );
}

/** Card di una voce, condivisa da VoceFocus (operatore) e dall'anteprima del template. */
export function VoceCard({
  voce, indice, campi, dettaglio, titoloCampi, stato, disabilitato, onChange,
  headerRight, approvazioneStato, motivoRifiuto, notaUfficio,
}: {
  voce: VoceCardData;
  indice: number;
  campi: TemplateCampo[];
  dettaglio: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  stato: StatoVoce;
  disabilitato: boolean;
  onChange: (chiave: string, valore: unknown) => void;
  headerRight?: React.ReactNode;
  approvazioneStato?: string | null;
  motivoRifiuto?: string | null;
  notaUfficio?: string | null;
}) {
  const badge = badgeVoceManuale(approvazioneStato ?? null);
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const bordo = stato === 'eseguito' ? 'border-[var(--status-ok)]' : stato === 'non_eseguito' ? 'border-[var(--status-ko)]' : 'border-[var(--brand-border)]';
  const notaMancante = motivoVoceIncompleta(voce.risposte, campi) === 'nota_mancante';

  return (
    <section className={`rounded-2xl border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
      <div className="flex items-start justify-between gap-3">
        <VoceTitolo voce={voce} titoloCampi={titoloCampi} indice={indice} />
        {headerRight}
      </div>
      {badge && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${badge.tono === 'attesa' ? 'bg-[var(--warning-soft)] text-[var(--brand-text-main)]' : 'bg-[var(--status-ko-soft)] text-[var(--status-ko)]'}`}>
          {badge.label}
          {badge.tono === 'attesa' && ' — in attesa di approvazione dalla centrale'}
          {badge.tono === 'rifiutato' && motivoRifiuto ? ` · ${motivoRifiuto}` : ''}
        </div>
      )}
      <VoceHeaderInfo voce={voce} coordinataAbilitata={coordinataAbilitata} />
      {notaUfficio && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3.5 py-2.5">
          <span aria-hidden className="text-base leading-none">📝</span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Nota dall&apos;ufficio</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[var(--brand-text-main)]">{notaUfficio}</p>
          </div>
        </div>
      )}
      {notaMancante && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-3.5 py-2.5">
          <span aria-hidden className="text-base leading-none">⚠️</span>
          <p className="text-[13px] font-semibold text-[var(--status-ko)]">
            Esito negativo: la nota è obbligatoria. Compila il campo nota qui sotto per completare l&apos;intervento.
          </p>
        </div>
      )}
      <VoceDettagli voce={voce} dettaglio={dettaglio} />
      <VoceCampi campi={campi} voce={voce} disabilitato={disabilitato} onChange={onChange} evidenziaNota={notaMancante} />
    </section>
  );
}
