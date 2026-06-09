'use client';

import { useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import { datiFormRevisione } from '@/lib/interventi/manuali/datiFormRevisione';
import type { RigaRichiesta, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

export function PannelloRevisioneRichiesta({
  riga,
  infoCampi,
  campiEsito,
  onDecisa,
}: {
  riga: RigaRichiesta;
  infoCampi: TemplateInfoCampo[];
  campiEsito: TemplateCampo[];
  onDecisa: () => void;
}) {
  const iniziali = useMemo(() => datiFormRevisione(riga), [riga]);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>(iniziali.anagrafica);
  const [risposte, setRisposte] = useState<Record<string, unknown>>(iniziali.risposte);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);

  const approva = async () => {
    setBusy(true); setErrore(null);
    try {
      const dati_correnti: DatiInterventoManuale = { committente: iniziali.committente, anagrafica, risposte };
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/approva`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dati_correnti }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDecisa();
    } catch (e) { setErrore(e instanceof Error ? e.message : 'Errore'); } finally { setBusy(false); }
  };

  const rifiuta = async () => {
    setBusy(true); setErrore(null);
    try {
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/rifiuta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDecisa();
    } catch (e) { setErrore(e instanceof Error ? e.message : 'Errore'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">{riga.staff_name ?? riga.staff_id} · {riga.committente} · {riga.data}</p>
      {campiAnag.map((c) => (
        <div key={c.chiave}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
          <input type="text" value={anagrafica[c.chiave] ?? ''} onChange={(e) => setAnagrafica((p) => ({ ...p, [c.chiave]: e.target.value }))} className={inputCls} />
        </div>
      ))}
      {campiEsito.map((campo) => (
        <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={busy} onChange={(v) => setRisposte((p) => ({ ...p, [campo.chiave]: v }))} />
      ))}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Motivo rifiuto (se rifiuti)</label>
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
      </div>
      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={rifiuta} disabled={busy} className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 font-bold text-[var(--danger)] disabled:opacity-50">Rifiuta</button>
        <button type="button" onClick={approva} disabled={busy} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{busy ? '…' : 'Approva'}</button>
      </div>
    </div>
  );
}
