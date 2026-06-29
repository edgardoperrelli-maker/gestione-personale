'use client';

import { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { ReperibileRef } from '@/lib/pi/types';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

export default function ModalePIManuale({
  token,
  campi,
  infoCampi,
  reperibili,
  onClose,
  onSaved,
}: {
  token: string;
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  reperibili: Record<string, ReperibileRef[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<string>(oggiRoma());
  const [esecutore, setEsecutore] = useState<string>('');
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const reperibiliData = useMemo<ReperibileRef[]>(() => reperibili[data] ?? [], [reperibili, data]);

  // Preselezione automatica se c'è un solo reperibile per la data scelta.
  const esecutoreEff = useMemo(() => {
    if (esecutore && reperibiliData.some((r) => r.staffId === esecutore)) return esecutore;
    if (reperibiliData.length === 1) return reperibiliData[0].staffId;
    return esecutore;
  }, [esecutore, reperibiliData]);

  const anomalia = data !== '' && esecutoreEff !== '' && !reperibiliData.some((r) => r.staffId === esecutoreEff);

  const campiOrdinati = useMemo(() => [...campi].sort((a, b) => a.ordine - b.ordine), [campi]);
  const infoOrdinati = useMemo(() => [...infoCampi].sort((a, b) => a.ordine - b.ordine), [infoCampi]);

  async function invia() {
    setErrore(null);
    if (!esecutoreEff) { setErrore('Seleziona l’esecutore.'); return; }
    setSalvataggio(true);
    try {
      const richiestaId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
      const res = await fetch(`/api/pi/${token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          richiestaId,
          esecutoreStaffId: esecutoreEff,
          esecutoreNome: reperibiliData.find((r) => r.staffId === esecutoreEff)?.nome,
          data,
          anagrafica,
          risposte,
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
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Esecutore (reperibile)</label>
          <select value={esecutoreEff} onChange={(e) => setEsecutore(e.target.value)} className={inputCls}>
            <option value="">— Seleziona —</option>
            {reperibiliData.map((r) => (
              <option key={r.staffId} value={r.staffId}>{r.nome}</option>
            ))}
          </select>
          {reperibiliData.length === 0 && (
            <p className="mt-1 text-xs text-[var(--warning)]">Nessun reperibile in cronoprogramma per questa data.</p>
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

        {errore && <p className="text-sm font-semibold text-[var(--danger)]">{errore}</p>}
      </div>
    </Dialog>
  );
}
