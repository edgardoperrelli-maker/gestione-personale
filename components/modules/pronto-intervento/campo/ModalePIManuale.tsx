'use client';

import { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { ReperibileRef } from '@/lib/pi/types';
import { matricolaPatchMancante, PATCH_KEY, PATCH_MATRICOLA_KEY } from '@/lib/pi/patch';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

const ALTRO = '__altro__';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

export default function ModalePIManuale({
  token,
  campi,
  infoCampi,
  reperibili,
  operatori,
  onClose,
  onSaved,
}: {
  token: string;
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  reperibili: Record<string, ReperibileRef[]>;
  operatori: ReperibileRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<string>(oggiRoma());
  const [esecutore, setEsecutore] = useState<string>('');
  const [altro, setAltro] = useState(false); // true → scelta dalla lista completa operatori
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [patch, setPatch] = useState(false);
  const [patchMatricola, setPatchMatricola] = useState('');
  const [scanner, setScanner] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const reperibiliData = useMemo<ReperibileRef[]>(() => reperibili[data] ?? [], [reperibili, data]);

  // Esecutore effettivo. In modalità "Altro" vale la scelta dalla lista completa;
  // altrimenti la scelta dai reperibili, con preselezione se ce n'è uno solo.
  const esecutoreEff = useMemo(() => {
    if (altro) return esecutore;
    if (esecutore && reperibiliData.some((r) => r.staffId === esecutore)) return esecutore;
    if (reperibiliData.length === 1) return reperibiliData[0].staffId;
    return esecutore;
  }, [altro, esecutore, reperibiliData]);

  const nomeEff = useMemo(
    () =>
      reperibiliData.find((r) => r.staffId === esecutoreEff)?.nome ??
      operatori.find((o) => o.staffId === esecutoreEff)?.nome,
    [reperibiliData, operatori, esecutoreEff],
  );

  const anomalia = data !== '' && esecutoreEff !== '' && !reperibiliData.some((r) => r.staffId === esecutoreEff);

  const campiOrdinati = useMemo(() => [...campi].sort((a, b) => a.ordine - b.ordine), [campi]);
  const infoOrdinati = useMemo(() => [...infoCampi].sort((a, b) => a.ordine - b.ordine), [infoCampi]);

  function selezionaEsecutore(v: string) {
    if (v === ALTRO) {
      setAltro(true);
      setEsecutore('');
    } else {
      setAltro(false);
      setEsecutore(v);
    }
  }

  async function invia() {
    setErrore(null);
    if (!esecutoreEff) { setErrore('Seleziona l’esecutore.'); return; }
    const risposteFull = {
      ...risposte,
      [PATCH_KEY]: patch,
      [PATCH_MATRICOLA_KEY]: patch ? patchMatricola.trim() : '',
    };
    if (matricolaPatchMancante(risposteFull)) { setErrore('Inserisci la matricola della patch.'); return; }
    setSalvataggio(true);
    try {
      const richiestaId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
      const res = await fetch(`/api/pi/${token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          richiestaId,
          esecutoreStaffId: esecutoreEff,
          esecutoreNome: nomeEff,
          data,
          anagrafica,
          risposte: risposteFull,
          note: typeof risposte['note'] === 'string' ? (risposte['note'] as string) : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrore(j.dettaglio || j.error || 'Errore di invio.');
        setSalvataggio(false);
        return;
      }
      onSaved();
    } catch {
      setErrore('Connessione assente: riprova quando torni online.');
      setSalvataggio(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        variant="sheet"
        title="Nuova chiamata P.I."
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium">Annulla</button>
            <button
              type="button"
              disabled={salvataggio}
              onClick={invia}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
            >
              {salvataggio ? 'Invio…' : 'Invia richiesta'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Data chiamata</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Esecutore</label>
            <select
              value={altro ? ALTRO : esecutoreEff}
              onChange={(e) => selezionaEsecutore(e.target.value)}
              className={inputCls}
            >
              <option value="">— Seleziona —</option>
              {reperibiliData.map((r) => (
                <option key={r.staffId} value={r.staffId}>{r.nome}</option>
              ))}
              <option value={ALTRO}>Altro operatore…</option>
            </select>

            {altro && (
              <select
                value={esecutore}
                onChange={(e) => setEsecutore(e.target.value)}
                className={`${inputCls} mt-2`}
              >
                <option value="">— Seleziona operatore —</option>
                {operatori.map((o) => (
                  <option key={o.staffId} value={o.staffId}>{o.nome}</option>
                ))}
              </select>
            )}

            {!altro && reperibiliData.length === 0 && (
              <p className="mt-1 text-xs text-[var(--warning)]">Nessun reperibile in cronoprogramma per questa data: usa “Altro operatore”.</p>
            )}
            {anomalia && (
              <p className="mt-1 text-xs text-[var(--danger)]">Attenzione: l&rsquo;esecutore non risulta reperibile in questa data. Verrà inviato come anomalia, l&rsquo;ufficio verificherà.</p>
            )}
          </div>

          {infoOrdinati.map((c) => (
            <div key={c.chiave}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
              <input
                type="text"
                value={anagrafica[c.chiave] ?? ''}
                // MAIUSCOLO "IME-safe": su Android non muta il testo durante la composizione, così lo
                // SPAZIO non cancella il campo (il MAIUSCOLO definitivo è garantito dal server).
                onChange={(e) => setAnagrafica((a) => ({ ...a, [c.chiave]: maiuscoloDigitando(e) }))}
                onCompositionEnd={(e) => { const v = e.currentTarget.value.toUpperCase(); setAnagrafica((a) => ({ ...a, [c.chiave]: v })); }}
                className={`${inputCls} uppercase`}
              />
            </div>
          ))}

          {campiOrdinati.map((campo) => (
            <CampoInput
              key={campo.chiave}
              campo={campo}
              valore={risposte[campo.chiave]}
              disabilitato={false}
              onChange={(v) => setRisposte((r) => ({ ...r, [campo.chiave]: v }))}
            />
          ))}

          {/* Campo PATCH: crocetta; se spuntata la matricola è obbligatoria (scan o digitazione). */}
          <div className="rounded-lg border border-[var(--brand-border)] p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--brand-text-main)]">
              <input type="checkbox" checked={patch} onChange={(e) => setPatch(e.target.checked)} className="h-4 w-4" />
              PATCH
            </label>
            {patch && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Matricola patch</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={patchMatricola}
                    onChange={(e) => setPatchMatricola(e.target.value.toUpperCase())}
                    placeholder="Matricola"
                    className={`${inputCls} uppercase`}
                  />
                  <button
                    type="button"
                    onClick={() => setScanner(true)}
                    className="shrink-0 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]"
                  >
                    📷 Scansiona
                  </button>
                </div>
              </div>
            )}
          </div>

          {errore && <p className="text-sm font-semibold text-[var(--danger)]">{errore}</p>}
        </div>
      </Dialog>

      {scanner && (
        <ScannerMisuratore
          etichetta="Inquadra il codice della patch"
          onCodice={(c) => { setPatchMatricola(c.trim().toUpperCase()); setScanner(false); }}
          onChiudi={() => setScanner(false)}
        />
      )}
    </>
  );
}
