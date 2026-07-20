'use client';

import { useEffect, useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { ReperibileRef, PiTokenStato } from '@/lib/pi/types';
import { piTokenStato } from '@/lib/pi/tokenValidita';
import { matricolaPatchMancante, PATCH_KEY, PATCH_MATRICOLA_KEY } from '@/lib/pi/patch';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}
function fmtData(d: string): string {
  if (!d) return '';
  const [y, m, g] = d.split('-');
  return `${g}/${m}/${y}`;
}
const STATO_TESTO: Record<PiTokenStato, string> = { valido: 'Attivo', scaduto: 'Scaduto', non_attivo: 'Non attivo', revocato: 'Chiuso' };

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

export type LinkOpt = { id: string; valido_dal: string; valido_al: string; note: string | null; revocato_at: string | null };

/** Inserimento manuale P.I. dal backoffice: direttamente approvato (POST admin), con
 *  associazione opzionale a un link (default sul link attivo). */
export default function ModalePIBackoffice({
  area,
  links,
  onClose,
  onSaved,
}: {
  area: string;
  links: LinkOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);
  const [operatori, setOperatori] = useState<ReperibileRef[]>([]);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  // Default: link attivo (valido) se esiste, altrimenti "nessun link".
  const linkAttivo = useMemo(() => links.find((l) => piTokenStato(l, nowIso) === 'valido') ?? null, [links, nowIso]);

  const [tokenId, setTokenId] = useState<string>(linkAttivo?.id ?? '');
  const [data, setData] = useState<string>(oggiRoma());
  const [esecutore, setEsecutore] = useState<string>('');
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [patch, setPatch] = useState(false);
  const [patchMatricola, setPatchMatricola] = useState('');
  const [scanner, setScanner] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/pi/nuovo', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        setCampi((j.campi ?? []) as TemplateCampo[]);
        setInfoCampi((j.infoCampi ?? []) as TemplateInfoCampo[]);
        setOperatori((j.operatori ?? []) as ReperibileRef[]);
      }
    })();
  }, []);

  const campiOrdinati = useMemo(() => [...campi].sort((a, b) => a.ordine - b.ordine), [campi]);
  const infoOrdinati = useMemo(() => [...infoCampi].sort((a, b) => a.ordine - b.ordine), [infoCampi]);
  const nomeEff = useMemo(() => operatori.find((o) => o.staffId === esecutore)?.nome, [operatori, esecutore]);

  async function salva() {
    setErrore(null);
    if (!esecutore) { setErrore('Seleziona l’esecutore.'); return; }
    if (!data) { setErrore('Indica la data.'); return; }
    const risposteFull = {
      ...risposte,
      [PATCH_KEY]: patch,
      [PATCH_MATRICOLA_KEY]: patch ? patchMatricola.trim() : '',
    };
    if (matricolaPatchMancante(risposteFull)) { setErrore('Inserisci la matricola della patch.'); return; }
    setSalvataggio(true);
    try {
      const res = await fetch('/api/admin/pi/interventi/manuale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area_codice: area,
          pi_token_id: tokenId || null,
          esecutoreStaffId: esecutore,
          esecutoreNome: nomeEff,
          data,
          anagrafica,
          risposte: risposteFull,
          note: typeof risposte['note'] === 'string' ? (risposte['note'] as string) : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErrore(j.dettaglio || j.error || 'Errore di salvataggio.');
        setSalvataggio(false);
        return;
      }
      onSaved();
    } catch {
      setErrore('Errore di rete: riprova.');
      setSalvataggio(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        variant="sheet"
        title="Inserisci intervento (backoffice)"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium">Annulla</button>
            <button
              type="button"
              disabled={salvataggio}
              onClick={salva}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
            >
              {salvataggio ? 'Salvataggio…' : 'Salva (approvato)'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--brand-text-muted)]">
            L’intervento inserito qui viene <strong>approvato direttamente</strong> e finisce in tabella.
          </p>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Link associato</label>
            <select value={tokenId} onChange={(e) => setTokenId(e.target.value)} className={inputCls}>
              <option value="">— Nessun link —</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {fmtData(l.valido_dal)}–{fmtData(l.valido_al)} · {STATO_TESTO[piTokenStato(l, nowIso)]}{l.note ? ` · ${l.note}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Esecutore</label>
            <select value={esecutore} onChange={(e) => setEsecutore(e.target.value)} className={inputCls}>
              <option value="">— Seleziona operatore —</option>
              {operatori.map((o) => (
                <option key={o.staffId} value={o.staffId}>{o.nome}</option>
              ))}
            </select>
          </div>

          {infoOrdinati.map((c) => (
            <div key={c.chiave}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
              <input
                type="text"
                value={anagrafica[c.chiave] ?? ''}
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
