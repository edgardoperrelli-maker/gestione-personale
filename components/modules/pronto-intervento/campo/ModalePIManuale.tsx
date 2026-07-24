'use client';

import { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
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

/** Dati di una chiamata esistente per la modalità modifica (Q4: solo con link valido). */
export type RigaEsistente = {
  id: string;
  data: string | null;
  esecutoreStaffId: string | null;
  anagrafica: Record<string, unknown>;
  risposte: Record<string, unknown>;
};

export default function ModalePIManuale({
  token,
  campi,
  infoCampi,
  reperibili,
  operatori,
  esistente,
  onClose,
  onSaved,
}: {
  token: string;
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  reperibili: Record<string, ReperibileRef[]>;
  operatori: ReperibileRef[];
  /** Se presente → modalità modifica (PUT sulla stessa riga); altrimenti nuova chiamata (POST). */
  esistente?: RigaEsistente;
  onClose: () => void;
  onSaved: () => void;
}) {
  const modifica = !!esistente;
  const dataIniziale = esistente?.data || oggiRoma();
  const [data, setData] = useState<string>(dataIniziale);
  // In modifica preseleziono l'esecutore esistente; "Altro" se non è tra i reperibili di quel giorno.
  const [esecutore, setEsecutore] = useState<string>(esistente?.esecutoreStaffId ?? '');
  const [altro, setAltro] = useState<boolean>(() => {
    const sid = esistente?.esecutoreStaffId;
    if (!sid) return false;
    return !(reperibili[dataIniziale] ?? []).some((r) => r.staffId === sid);
  });
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>(() => {
    const src = esistente?.anagrafica ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) out[k] = v == null ? '' : String(v);
    return out;
  });
  const [risposte, setRisposte] = useState<Record<string, unknown>>(() => ({ ...(esistente?.risposte ?? {}) }));
  const [patch, setPatch] = useState<boolean>(esistente?.risposte?.[PATCH_KEY] === true);
  const [patchMatricola, setPatchMatricola] = useState<string>(String(esistente?.risposte?.[PATCH_MATRICOLA_KEY] ?? ''));
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
      const url = modifica
        ? `/api/pi/${token}/intervento/${esistente!.id}`
        : `/api/pi/${token}/intervento`;
      const res = await fetch(url, {
        method: modifica ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(modifica ? {} : { richiestaId }),
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
        title={modifica ? 'Modifica chiamata P.I.' : 'Nuova chiamata P.I.'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button variant="primary" loading={salvataggio} onClick={invia}>
              {salvataggio ? 'Salvataggio…' : modifica ? 'Salva modifiche' : 'Invia richiesta'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Data chiamata</label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Esecutore</label>
            <Select
              value={altro ? ALTRO : esecutoreEff}
              onChange={(e) => selezionaEsecutore(e.target.value)}
            >
              <option value="">— Seleziona —</option>
              {reperibiliData.map((r) => (
                <option key={r.staffId} value={r.staffId}>{r.nome}</option>
              ))}
              <option value={ALTRO}>Altro operatore…</option>
            </Select>

            {altro && (
              <Select
                value={esecutore}
                onChange={(e) => setEsecutore(e.target.value)}
                className="mt-2"
              >
                <option value="">— Seleziona operatore —</option>
                {operatori.map((o) => (
                  <option key={o.staffId} value={o.staffId}>{o.nome}</option>
                ))}
              </Select>
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
              <Input
                type="text"
                value={anagrafica[c.chiave] ?? ''}
                // MAIUSCOLO "IME-safe": su Android non muta il testo durante la composizione, così lo
                // SPAZIO non cancella il campo (il MAIUSCOLO definitivo è garantito dal server).
                onChange={(e) => setAnagrafica((a) => ({ ...a, [c.chiave]: maiuscoloDigitando(e) }))}
                onCompositionEnd={(e) => { const v = e.currentTarget.value.toUpperCase(); setAnagrafica((a) => ({ ...a, [c.chiave]: v })); }}
                className="uppercase"
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
          <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--brand-text-main)]">
              <input type="checkbox" checked={patch} onChange={(e) => setPatch(e.target.checked)} className="h-4 w-4" />
              PATCH
            </label>
            {patch && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Matricola patch</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={patchMatricola}
                    onChange={(e) => setPatchMatricola(e.target.value.toUpperCase())}
                    placeholder="Matricola"
                    className="uppercase"
                  />
                  <Button variant="outline" className="shrink-0" onClick={() => setScanner(true)}>
                    <Camera className="h-4 w-4" aria-hidden /> Scansiona
                  </Button>
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
