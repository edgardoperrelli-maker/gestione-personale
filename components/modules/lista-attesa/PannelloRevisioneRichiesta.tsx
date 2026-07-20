'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from '@/components/modules/rapportini/CampoInput';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
import { formatDataIt, formatDataOraIt, formatOraIt } from '@/lib/interventi/manuali/formatDataIt';
import { datiFormRevisione } from '@/lib/interventi/manuali/datiFormRevisione';
import { campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { CaricaFotoRichiesta } from './CaricaFotoRichiesta';
import type { RigaRichiesta, DatiInterventoManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';
import { committenteEquivalente, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';

type DuplicatoMatricola = {
  id: string;
  data: string | null;
  staff_name: string | null;
  deciso_at: string | null;
  deciso_da_name: string | null;
};

type DuplicatoSigillo = {
  id: string;
  data: string | null;
  comune: string | null;
  odl: string | null;
  matricola: string | null;
  staff_name: string | null;
};

export function PannelloRevisioneRichiesta({
  riga,
  infoCampi,
  campiEsito,
  tassonomia,
  onDecisa,
}: {
  riga: RigaRichiesta;
  infoCampi: TemplateInfoCampo[];
  campiEsito: TemplateCampo[];
  /** Tassonomia attività: alimenta la select obbligatoria (spec §7). */
  tassonomia?: TassonomiaRiga[];
  onDecisa: () => void;
}) {
  const iniziali = useMemo(() => datiFormRevisione(riga), [riga]);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>(iniziali.anagrafica);
  const [risposte, setRisposte] = useState<Record<string, unknown>>(iniziali.risposte);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [dupAvviso, setDupAvviso] = useState<{ matricola: string; duplicati: DuplicatoMatricola[] } | null>(null);
  const [sigBloccante, setSigBloccante] = useState<{ sigillo: string; duplicati: DuplicatoSigillo[] } | null>(null);
  const [fotoAvviso, setFotoAvviso] = useState<number | null>(null);
  const campiAnag = useMemo(() => anagraficaCampi(infoCampi), [infoCampi]);
  // Descrizione attività: lista chiusa dalla tassonomia (spec §7), come nel "+" — stesso filtro
  // per committente equivalente ('lim_massive' → 'acea'; 'altro' → tutte le attive).
  const opzioniAttivita = useMemo(() => {
    const ce = committenteEquivalente(riga.committente);
    const attive = (tassonomia ?? []).filter((t) => t.attivo);
    return ce === 'altro' ? attive : attive.filter((t) => t.committente === ce);
  }, [tassonomia, riga.committente]);
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null; fileMancante: boolean }>>([]);
  const caricaFoto = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/interventi-manuali/${riga.id}/foto`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { foto: [] }) as { foto?: Array<{ id: string; etichetta: string; url: string | null; fileMancante: boolean }> };
      setFoto(j.foto ?? []);
    } catch { /* foto opzionali: errore silenzioso */ }
  }, [riga.id]);
  useEffect(() => { void caricaFoto(); }, [caricaFoto]);

  const approva = async (forza = false, forzaFoto = false) => {
    if (!String(anagrafica.attivita ?? '').trim()) {
      setErrore('Scegli la descrizione attività: è obbligatoria.');
      return;
    }
    setBusy(true); setErrore(null); setSigBloccante(null);
    try {
      const dati_correnti: DatiInterventoManuale = { committente: iniziali.committente, anagrafica, risposte };
      const res = await fetch(`/api/admin/interventi-manuali/${riga.id}/approva`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dati_correnti, confermaDuplicato: forza, confermaFotoMancanti: forzaFoto }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; messaggio?: string; matricola?: string; sigillo?: string; duplicati?: DuplicatoMatricola[] | DuplicatoSigillo[]; mancanti?: number };
        // Sigillo duplicato: BLOCCANTE (nessun bypass) → va corretto prima di approvare.
        if (j.error === 'sigillo_duplicato') { setSigBloccante({ sigillo: j.sigillo ?? '', duplicati: (j.duplicati as DuplicatoSigillo[]) ?? [] }); return; }
        if (j.error === 'matricola_duplicata') { setDupAvviso({ matricola: j.matricola ?? '', duplicati: (j.duplicati as DuplicatoMatricola[]) ?? [] }); return; }
        if (j.error === 'foto_mancanti') { setFotoAvviso(j.mancanti ?? 0); return; }
        // Qualunque altro errore (doppione intervento, errore DB, ecc.): mostra il messaggio REALE dal server.
        throw new Error(j.messaggio || j.error || `HTTP ${res.status}`);
      }
      setDupAvviso(null); setFotoAvviso(null);
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
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium text-[var(--brand-text-muted)]">
        {riga.staff_name ?? riga.staff_id} · {etichettaCommittente(riga.committente)} · {formatDataIt(riga.data)} · inviata {formatOraIt(riga.created_at)}
      </p>

      {/* Anagrafica compatta: 2 colonne */}
      {campiAnag.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {campiAnag.map((c) => (
            <div key={c.chiave} className={c.chiave === 'attivita' ? 'col-span-2 min-w-0' : 'min-w-0'}>
              <label className="mb-0.5 block truncate text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                {c.etichetta}
                {c.chiave === 'attivita' && <span className="text-[var(--danger)]"> *</span>}
              </label>
              {c.chiave === 'attivita' ? (
                // Descrizione attività: OBBLIGATORIA, lista chiusa dalla tassonomia (spec §7).
                <Select
                  required
                  value={anagrafica.attivita ?? ''}
                  onChange={(e) => setAnagrafica((p) => ({ ...p, attivita: e.target.value }))}
                  className="py-1.5 text-xs"
                >
                  <option value="">— scegli l&apos;attività —</option>
                  {opzioniAttivita.map((o) => (
                    <option key={`${o.committente}|${o.descrizione}`} value={o.descrizione}>
                      {o.descrizione} — {o.gruppo}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="text"
                  value={anagrafica[c.chiave] ?? ''}
                  onChange={(e) => setAnagrafica((p) => ({ ...p, [c.chiave]: e.target.value }))}
                  className="py-1.5 text-xs"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Esiti — solo campi NON foto, su 2 colonne */}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Foto ({foto.length})
            {foto.some((f) => f.fileMancante) && (
              <span className="text-[var(--danger)]"> · {foto.filter((f) => f.fileMancante).length} da re-inviare</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {foto.map((f) => (f.url ? (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.etichetta} className="block h-16 w-16 overflow-hidden rounded-[var(--radius-md)] border border-[var(--brand-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etichetta} className="h-full w-full object-cover" />
              </a>
            ) : (
              <div key={f.id} title={`${f.etichetta} — file mancante, da re-inviare`} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border border-dashed border-[var(--danger)] bg-[var(--danger-soft)] p-1 text-center">
                <span className="text-[13px] leading-none" aria-hidden>⚠️</span>
                <span className="text-xs font-semibold leading-tight text-[var(--danger)]">da re-inviare</span>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* Carica foto di recupero (ufficio) */}
      <CaricaFotoRichiesta richiestaId={riga.id} slotFoto={campiFoto(campiEsito)} onCaricato={caricaFoto} />

      {/* Motivo rifiuto (compatto) */}
      <Input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo rifiuto (se rifiuti)"
        className="py-1.5 text-xs"
      />

      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}

      {/* Sigillo duplicato — alert BLOCCANTE (nessun "approva comunque"): va corretto qui */}
      {sigBloccante && (
        <div
          className="space-y-2 rounded-[var(--radius-md)] border p-3"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)' }}
        >
          <p className="text-sm font-bold" style={{ color: 'var(--danger)' }}>
            &#9940; Sigillo {sigBloccante.sigillo} GIÀ presente nel database ({sigBloccante.duplicati.length})
          </p>
          <p className="text-xs text-[var(--brand-text-main)]">
            Per evitare un doppione nel file master, correggi il sigillo nei campi esito qui sopra e riprova. L&apos;approvazione è bloccata finché il sigillo resta duplicato.
          </p>
          {sigBloccante.duplicati.length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--brand-text-main)]">
              {sigBloccante.duplicati.map((d) => (
                <li key={d.id}>
                  &bull; {formatDataIt(d.data)}
                  {d.comune ? ` · ${d.comune}` : ''}
                  {d.odl ? ` · ODL ${d.odl}` : ''}
                  {d.matricola ? ` · matr. ${d.matricola}` : ''}
                  {d.staff_name ? ` · ${d.staff_name}` : ''}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" animated={false} disabled={busy} onClick={() => setSigBloccante(null)}>
              Chiudi
            </Button>
          </div>
        </div>
      )}

      {/* Avviso duplicato matricola — callout sobrio */}
      {dupAvviso && (
        <div
          className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning)] p-3"
          style={{ backgroundColor: 'var(--warning-soft)' }}
        >
          <p className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
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
            <Button variant="secondary" size="sm" animated={false} disabled={busy} onClick={() => setDupAvviso(null)}>
              Annulla
            </Button>
            <Button
              variant="secondary"
              size="sm"
              animated={false}
              disabled={busy}
              className="border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning-soft)]"
              onClick={() => void approva(true)}
            >
              Approva comunque
            </Button>
          </div>
        </div>
      )}

      {/* Avviso foto mancanti — callout forzabile */}
      {fotoAvviso !== null && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--warning)] p-3" style={{ backgroundColor: 'var(--warning-soft)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
            &#9888; Mancano {fotoAvviso} foto: l&apos;intervento risulterà senza prove.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" animated={false} disabled={busy} onClick={() => setFotoAvviso(null)}>Annulla</Button>
            <Button variant="secondary" size="sm" animated={false} disabled={busy}
              className="border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning-soft)]"
              onClick={() => void approva(false, true)}>Approva comunque</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="danger" size="md" animated={false} disabled={busy} onClick={rifiuta}>
          Rifiuta
        </Button>
        <Button variant="primary" size="md" animated={false} disabled={busy} className="flex-1" onClick={() => void approva()}>
          {busy ? '…' : 'Approva'}
        </Button>
      </div>
    </div>
  );
}
