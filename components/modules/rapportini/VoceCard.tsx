/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { ChevronDown, Clock, Crosshair, MapPin, StickyNote, TriangleAlert } from 'lucide-react';
import { titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { StatoVoce } from '@/utils/rapportini/riepilogo';
import { CampoInput } from './CampoInput';
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';
import { motivoVoceIncompleta, isCampoNota } from '@/utils/rapportini/voceMancante';
import { BannerNotaCollega } from './NotaCollega';
import type { NotaPrecedente } from '@/lib/interventi/notePrecedenti';

export type VoceCardData = VoceInfo & { risposte: Record<string, unknown> };

/** Titolo della voce. */
export function VoceTitolo({ voce, titoloCampi, indice }: { voce: VoceCardData; titoloCampi: InfoChiave[]; indice: number }) {
  return <h1 className="min-w-0 text-xl font-semibold text-[var(--brand-text-main)] [overflow-wrap:anywhere]">{titoloVoce(voce, titoloCampi, indice)}</h1>;
}

/** Header: indirizzo (link Maps) + "Punto esatto" (se abilitato) + fascia. */
export function VoceHeaderInfo({ voce, coordinataAbilitata }: { voce: VoceCardData; coordinataAbilitata: boolean }) {
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  return (
    <div className="mt-2.5 space-y-1.5 text-sm text-[var(--brand-text-main)]">
      {indirizzo && (
        <a href={mapsUrlFromAddress(valoreInfo(voce, 'via'), valoreInfo(voce, 'comune'), valoreInfo(voce, 'cap'))} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
          <MapPin className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} aria-hidden />
          <span>{indirizzo}</span>
        </a>
      )}
      {coordinataAbilitata && coordinata && (
        <a href={mapsUrlFromCoordinate(coordinata)} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline">
          <Crosshair className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} aria-hidden />
          <span>Punto esatto · {coordinata}</span>
        </a>
      )}
      {fascia && (
        <div className="flex items-center gap-2">
          <Clock className="h-[17px] w-[17px] shrink-0 text-[var(--brand-primary)]" strokeWidth={1.8} aria-hidden />
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
        <ChevronDown className="h-[18px] w-[18px] shrink-0 transition-transform group-open:rotate-180" strokeWidth={1.8} aria-hidden />
      </summary>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 pt-1">
        {dett.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-tight text-[var(--brand-text-subtle)]">{r.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-[var(--brand-text-main)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Campi da compilare: campi "altri" + crocette "Lavorazioni". */
export function VoceCampi({ campi, voce, disabilitato, onChange, evidenziaNota, evidenziaMatricola }: { campi: TemplateCampo[]; voce: VoceCardData; disabilitato: boolean; onChange: (chiave: string, valore: unknown) => void; evidenziaNota?: boolean; evidenziaMatricola?: boolean }) {
  const crocette = campi.filter((c) => c.tipo === 'crocetta');
  const altri = campi.filter((c) => c.tipo !== 'crocetta');
  // Il campo che tiene ferma la voce si accende, qualunque dei due sia: la card è lunga e
  // «manca qualcosa» senza dire dove costa uno scorrimento a chi ha i guanti.
  const daAccendere = (campo: TemplateCampo) =>
    (Boolean(evidenziaNota) && isCampoNota(campo))
    || (Boolean(evidenziaMatricola) && campo.tipo === 'matricola' && campo.obbligatoria === true);
  return (
    <div className="mt-4 space-y-3.5">
      {altri.map((campo) => (
        <CampoInput key={campo.chiave} campo={campo} valore={voce.risposte[campo.chiave]} disabilitato={disabilitato} onChange={(v) => onChange(campo.chiave, v)} evidenzia={daAccendere(campo)} />
      ))}
      {crocette.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">Lavorazioni</p>
          <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
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
  headerRight, approvazioneStato, motivoRifiuto, notaUfficio, notePrecedenti,
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
  notePrecedenti?: NotaPrecedente[] | null;
}) {
  const badge = badgeVoceManuale(approvazioneStato ?? null);
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const bordo = stato === 'eseguito' ? 'border-[var(--status-ok)]' : stato === 'non_eseguito' ? 'border-[var(--status-ko)]' : 'border-[var(--brand-border)]';
  const motivo = motivoVoceIncompleta(voce.risposte, campi);
  const notaMancante = motivo === 'nota_mancante';
  const matricolaMancante = motivo === 'matricola_mancante';

  return (
    <section className={`rounded-[var(--radius-xl)] border bg-[var(--brand-surface)] p-4 shadow-sm ${bordo}`}>
      <div className="flex items-start justify-between gap-3">
        <VoceTitolo voce={voce} titoloCampi={titoloCampi} indice={indice} />
        {headerRight && <div className="shrink-0">{headerRight}</div>}
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
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-text-muted)]" strokeWidth={1.8} aria-hidden />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">Nota dall&apos;ufficio</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--brand-text-main)]">{notaUfficio}</p>
          </div>
        </div>
      )}
      {notePrecedenti && notePrecedenti.length > 0 && <BannerNotaCollega note={notePrecedenti} />}
      {notaMancante && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-3.5 py-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ko)]" strokeWidth={1.8} aria-hidden />
          <p className="text-sm font-semibold text-[var(--status-ko)]">
            Esito negativo: la nota è obbligatoria. Compila il campo nota qui sotto per completare l&apos;intervento.
          </p>
        </div>
      )}
      {/* Il gemello del banner qui sopra, sull'altro versante dell'esito: là il motivo di un NO,
          qui il numero di ciò che si è installato. Si dice sul posto, non a fine giornata. */}
      {matricolaMancante && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-3.5 py-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-ko)]" strokeWidth={1.8} aria-hidden />
          <p className="text-sm font-semibold text-[var(--status-ko)]">
            Manca la matricola del misuratore installato: scansionala o scrivila qui sotto per completare l&apos;intervento.
          </p>
        </div>
      )}
      <VoceDettagli voce={voce} dettaglio={dettaglio} />
      <VoceCampi campi={campi} voce={voce} disabilitato={disabilitato} onChange={onChange} evidenziaNota={notaMancante} evidenziaMatricola={matricolaMancante} />
    </section>
  );
}