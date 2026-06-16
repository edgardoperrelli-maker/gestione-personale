'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
import { formatDataIt, formatDataOraIt } from '@/lib/interventi/manuali/formatDataIt';
import { datiFormRevisione } from '@/lib/interventi/manuali/datiFormRevisione';
import { campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { CaricaFotoRichiesta } from './CaricaFotoRichiesta';
import type { RigaRichiesta, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';

type DuplicatoMatricola = {
  id: string;
  data: string | null;
  staff_name: string | null;
  deciso_at: string | null;
  deciso_da_name: string | null;
};

const campoCompactCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-1.5 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

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
  const [dupAvviso, setDupAvviso] = useState<{ matricola: string; duplicati: DuplicatoMatricola[] } | null>(null);
  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  const caricaFoto = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/interventi-manuali/${riga.id}/foto`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { foto: [] }) as { foto?: Array<{ id: string; etichetta: string; url: string | null }> };
      setFoto(j.foto ?? []);
    } catch { /* foto opzionali: errore silenzioso */ }
  }, [riga.id]);
  useEffect(() => { void caricaFoto(); }, [caricaFoto]);

  const approva = async (forza = false) => {
    setBusy(true); setErrore(null);
    try {
      const dati_correnti: DatiInterventoManuale = { committente: iniziali.committente, anagrafica, risposte };
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/approva`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dati_correnti, confermaDuplicato: forza }),
      });
      if (res.status === 409) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; matricola?: string; duplicati?: DuplicatoMatricola[] };
        if (j.error === 'matricola_duplicata') {
          setDupAvviso({ matricola: j.matricola ?? '', duplicati: j.duplicati ?? [] });
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDupAvviso(null);
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
    <div className="space-y-2.5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">{riga.staff_name ?? riga.staff_id} · {etichettaCommittente(riga.committente)} · {formatDataIt(riga.data)}</p>

      {/* Anagrafica compatta: 2 colonne */}
      {campiAnag.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {campiAnag.map((c) => (
            <div key={c.chiave} className="min-w-0">
              <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
              <input type="text" value={anagrafica[c.chiave] ?? ''} onChange={(e) => setAnagrafica((p) => ({ ...p, [c.chiave]: e.target.value }))} className={campoCompactCls} />
            </div>
          ))}
        </div>
      )}

      {/* Esiti — solo campi NON foto (le foto stanno nella galleria + uploader sotto), su 2 colonne */}
      {campiEsito.some((c) => c.tipo !== 'foto') && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {campiEsito.filter((c) => c.tipo !== 'foto').map((campo) => (
            <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={busy} onChange={(v) => setRisposte((p) => ({ ...p, [campo.chiave]: v }))} />
          ))}
        </div>
      )}

      {/* Foto */}
      {foto.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Foto ({foto.length})</p>
          <div className="flex flex-wrap gap-2">
            {foto.map((f) => f.url && (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.etichetta} className="block h-16 w-16 overflow-hidden rounded-lg border border-[var(--brand-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etichetta} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Carica foto di recupero (ufficio) */}
      <CaricaFotoRichiesta richiestaId={riga.id} slotFoto={campiFoto(campiEsito)} onCaricato={caricaFoto} />

      {/* Motivo rifiuto (compatto) */}
      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo rifiuto (se rifiuti)"
        className={`${campoCompactCls} placeholder:text-[var(--brand-text-subtle)]`}
      />

      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}

      {dupAvviso && (
        <div className="space-y-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <p className="text-sm font-bold text-[var(--warning)]">
            &#9888; Matricola {dupAvviso.matricola} già approvata ({dupAvviso.duplicati.length})
          </p>
          <ul className="space-y-1 text-xs text-[var(--brand-text-main)]">
            {dupAvviso.duplicati.map((d) => (
              <li key={d.id}>
                &bull; {formatDataIt(d.data)}
                {d.staff_name ? ` · ${d.staff_name}` : ''}
                {d.deciso_at ? ` · approvato il ${formatDataOraIt(d.deciso_at)}` : ''}
                {d.deciso_da_name ? ` da ${d.deciso_da_name}` : ''}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDupAvviso(null)} disabled={busy} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-text-muted)] disabled:opacity-50">Annulla</button>
            <button type="button" onClick={() => void approva(true)} disabled={busy} className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1.5 text-xs font-bold text-[var(--warning)] disabled:opacity-50">Approva comunque</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={rifiuta} disabled={busy} className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2.5 font-bold text-[var(--danger)] disabled:opacity-50">Rifiuta</button>
        <button type="button" onClick={() => void approva()} disabled={busy} className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{busy ? '…' : 'Approva'}</button>
      </div>
    </div>
  );
}
