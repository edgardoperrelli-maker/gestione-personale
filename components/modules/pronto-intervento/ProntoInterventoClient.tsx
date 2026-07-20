'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import PannelloContabilita from './PannelloContabilita';
import ModalePIBackoffice from './ModalePIBackoffice';
import { generaRapportinoManutenzionePdfBlob, nomeFileRapportinoPI } from '@/lib/pi/rapportinoManutenzionePdf';
import { condividiOScarica } from '@/utils/rapportini/condividiFile';
import { piTokenStato } from '@/lib/pi/tokenValidita';
import type { PiTokenStato } from '@/lib/pi/types';

type Area = { codice: string; label: string; attiva: boolean; ordine: number; usa_contabilita: boolean; in_attesa?: number };

/** Cella modificabile per correzioni dell'ufficio (salva su blur). */
function EditableCell({ id, campo, valore, tipo = 'testo', onSaved }: {
  id: string; campo: string; valore: string; tipo?: 'testo' | 'data' | 'ora'; onSaved: () => void;
}) {
  const [v, setV] = useState(valore);
  useEffect(() => { setV(valore); }, [valore]);
  const cls = 'w-full min-w-[4.5rem] rounded bg-transparent px-1 py-0.5 text-sm focus:bg-[var(--brand-surface-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';
  async function save() {
    if (v === valore) return;
    await fetch(`/api/admin/pi/interventi/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campo, valore: v }),
    });
    onSaved();
  }
  if (tipo === 'data') return <input type="date" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} className={cls} />;
  if (tipo === 'ora') return <input type="time" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} className={cls} />;
  return <input type="text" value={v} onChange={(e) => setV(e.target.value.toUpperCase())} onBlur={save} className={`${cls} uppercase`} />;
}

/** Campo etichettato che incornicia una EditableCell (usato nell'apertura del task in coda). */
function CampoMod({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-xs">
      <span className="mb-0.5 block text-[var(--brand-text-muted)]">{label}</span>
      <div className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1 py-0.5">{children}</div>
    </div>
  );
}
type CodaRiga = {
  id: string; data: string | null; esecutore: string | null; indirizzo: unknown; comune: unknown;
  n_segnalazione: unknown; ora_inizio: unknown; ora_fine: unknown; assistente_te: unknown; note: unknown;
  anomalia_reperibilita: boolean;
};
type TabRiga = CodaRiga & { intervento_id: string | null; valore: number; patch?: boolean; patch_matricola?: unknown };
type RifiutataRiga = {
  id: string; data: string | null; esecutore: string | null; indirizzo: unknown; comune: unknown;
  n_segnalazione: unknown; motivo_rifiuto: string | null; anomalia_reperibilita: boolean;
};

function fmtData(d: string | null): string {
  if (!d) return '';
  const [y, m, g] = d.split('-');
  return `${g}/${m}/${y}`;
}
const s = (v: unknown) => (v == null ? '' : String(v));

async function condividiPdfTab(r: TabRiga) {
  const dl = r.data ? `${r.data.split('-')[2]}/${r.data.split('-')[1]}/${r.data.split('-')[0]}` : '';
  const blob = await generaRapportinoManutenzionePdfBlob({
    bollato: s(r.n_segnalazione), dataInizio: dl, dataFine: dl,
    oraInizio: s(r.ora_inizio), oraFine: s(r.ora_fine),
    indirizzo: s(r.indirizzo), comune: s(r.comune),
    assistenteItg: s(r.assistente_te), assistenteDitta: r.esecutore ?? '',
    descrizione: [s(r.note), r.patch ? `PATCH MATRICOLA: ${s(r.patch_matricola)}` : '']
      .filter(Boolean)
      .join('\n'),
  });
  await condividiOScarica({
    blob, filename: nomeFileRapportinoPI(s(r.n_segnalazione), r.data ?? ''),
    title: 'Rapportino manutenzione', text: `Rapportino P.I. ${s(r.n_segnalazione)}`.trim(),
  });
}

type LinkRow = {
  id: string; valido_dal: string; valido_al: string; token: string;
  note: string | null; revocato_at: string | null; created_at: string; n_rapportini: number;
};

/** Colonne della tabella Interventi: ordinabili + filtrabili dall'intestazione. */
type ColKey = 'n_segnalazione' | 'data' | 'comune' | 'indirizzo' | 'esecutore' | 'ora_inizio' | 'ora_fine' | 'assistente_te' | 'note' | 'valore';
const COLONNE: { key: ColKey; label: string; soloContab?: boolean; right?: boolean }[] = [
  { key: 'n_segnalazione', label: 'N° segn.' },
  { key: 'data', label: 'Data' },
  { key: 'comune', label: 'Comune' },
  { key: 'indirizzo', label: 'Indirizzo' },
  { key: 'esecutore', label: 'Esecutore' },
  { key: 'ora_inizio', label: 'Ora inizio' },
  { key: 'ora_fine', label: 'Ora fine' },
  { key: 'assistente_te', label: 'Assist. TE' },
  { key: 'note', label: 'Note' },
  { key: 'valore', label: 'Valore', soloContab: true, right: true },
];

/** Valore testuale di una colonna (per filtro e ordinamento). */
function valoreCol(r: TabRiga, k: ColKey): string {
  if (k === 'data') return fmtData(r.data);
  if (k === 'valore') return r.valore ? r.valore.toFixed(2) : '';
  if (k === 'esecutore') return r.esecutore ?? '';
  return s(r[k as keyof TabRiga]);
}

const STATO_LINK: Record<PiTokenStato, { label: string; cls: string }> = {
  valido: { label: 'Attivo', cls: 'bg-[var(--status-ok-soft,var(--brand-surface-muted))] text-[var(--status-ok,var(--brand-text-main))]' },
  scaduto: { label: 'Scaduto', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
  non_attivo: { label: 'Non attivo', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
  revocato: { label: 'Revocato', cls: 'bg-[var(--danger-soft,transparent)] text-[var(--danger)]' },
};

function oggiRomaYmd(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}
function addGiorniYmd(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Storico dei link P.I. della foglia: stato, validità, n° rapportini, copia e toggle Apri/Chiudi.
 *  "Chiudi" scade il link (valido_al=ieri); "Apri" lo riapre a una nuova data di fine (default +7). */
function StoricoLink({ righe, onCambiato }: { righe: LinkRow[]; onCambiato: () => void }) {
  const [copiato, setCopiato] = useState<string | null>(null);
  const [apriPer, setApriPer] = useState<string | null>(null);
  const [nuovaData, setNuovaData] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const nowIso = new Date().toISOString();

  async function copia(l: LinkRow) {
    const url = `${window.location.origin}/pi/${l.token}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopiato(l.id);
      setTimeout(() => setCopiato((c) => (c === l.id ? null : c)), 1800);
    } catch { /* noop */ }
  }
  async function chiudi(l: LinkRow) {
    setBusy(l.id);
    await fetch(`/api/admin/pi/token/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'chiudi' }),
    });
    setBusy(null);
    onCambiato();
  }
  function iniziaApri(l: LinkRow) {
    setApriPer(l.id);
    setNuovaData(addGiorniYmd(oggiRomaYmd(), 7));
  }
  async function confermaApri(l: LinkRow) {
    setBusy(l.id);
    const res = await fetch(`/api/admin/pi/token/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azione: 'apri', valido_al: nuovaData }),
    });
    setBusy(null);
    if (res.ok) { setApriPer(null); onCambiato(); }
    else { const j = await res.json().catch(() => ({})); window.alert(j.dettaglio || j.error || 'Errore nella riapertura.'); }
  }

  return (
    <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold">Link ({righe.length})</h3>
      {righe.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessun link generato per questa foglia.</p>
      ) : (
        <ul className="space-y-2">
          {righe.map((l) => {
            const stato = piTokenStato(l, nowIso);
            const badge = STATO_LINK[stato];
            const attivo = stato === 'valido';
            return (
              <li key={l.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${attivo ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]' : 'border-[var(--brand-border)]'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    <span className="truncate">{l.note || '—'}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
                    Validità {fmtData(l.valido_dal)} – {fmtData(l.valido_al)} · {l.n_rapportini} rapportini
                  </div>
                  {apriPer === l.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">Riapri fino al</label>
                      <input type="date" value={nuovaData} min={oggiRomaYmd()} onChange={(e) => setNuovaData(e.target.value)} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-sm" />
                      <button type="button" disabled={busy === l.id} onClick={() => confermaApri(l)} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--on-primary)] disabled:opacity-50">Conferma</button>
                      <button type="button" onClick={() => setApriPer(null)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium">Annulla</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => copia(l)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand-primary)]">
                    {copiato === l.id ? 'Copiato ✓' : 'Copia link'}
                  </button>
                  <a href={`/pi/${l.token}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--brand-primary)]">Apri pagina ↗</a>
                  {attivo ? (
                    <button type="button" disabled={busy === l.id} onClick={() => chiudi(l)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50">Chiudi</button>
                  ) : apriPer !== l.id ? (
                    <button type="button" onClick={() => iniziaApri(l)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand-primary)]">Apri</button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function ProntoInterventoClient() {
  const [aree, setAree] = useState<Area[]>([]);
  const [area, setArea] = useState<string | null>(null); // null = vista a card (sottomoduli)

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/pi/aree', { cache: 'no-store' });
      if (res.ok) setAree(((await res.json()).aree ?? []) as Area[]);
    })();
  }, []);

  const areaCorrente = useMemo(() => aree.find((a) => a.codice === area) ?? null, [aree, area]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pronto Intervento</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Chiamate P.I. sul campo, approvazione e contabilità.</p>
      </div>

      {!area || !areaCorrente?.attiva ? (
        <CardsSottomoduli aree={aree} onApri={(c) => setArea(c)} />
      ) : (
        <FogliaDettaglio area={areaCorrente} onIndietro={() => setArea(null)} />
      )}
    </div>
  );
}

/** Vista landing: una card per foglia (sottomodulo). */
function CardsSottomoduli({ aree, onApri }: { aree: Area[]; onApri: (codice: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {aree.map((a) => (
        <button
          key={a.codice}
          type="button"
          disabled={!a.attiva}
          onClick={() => a.attiva && onApri(a.codice)}
          className={`rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 text-left shadow-sm transition ${
            a.attiva
              ? 'hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]'
              : 'cursor-not-allowed opacity-60'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-semibold">{a.label}</span>
            {a.attiva ? (
              <span className="rounded-full bg-[var(--status-ok-soft,var(--brand-surface-muted))] px-2 py-0.5 text-xs font-semibold text-[var(--status-ok,var(--brand-text-main))]">Attiva</span>
            ) : (
              <span className="rounded-full bg-[var(--brand-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--brand-text-muted)]">in arrivo</span>
            )}
          </div>
          <p className="mt-2 text-sm text-[var(--brand-text-muted)]">
            {a.attiva ? 'Apri il sottomodulo: link, approvazioni, contabilità ed export.' : 'Sottomodulo non ancora attivo.'}
          </p>
          {a.attiva && (a.in_attesa ?? 0) > 0 && (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft,var(--brand-surface-muted))] px-2.5 py-1 text-xs font-semibold text-[var(--warning,var(--brand-text-main))]">
              {a.in_attesa} in approvazione
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

/** Striscia di conteggi in cima al Riepilogo. */
function StrisciaConteggi({ inAttesa, rifiutati, interventi, valore, mostraValore }: {
  inAttesa: number; rifiutati: number; interventi: number; valore: number; mostraValore: boolean;
}) {
  const Item = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Item label="In attesa" value={String(inAttesa)} />
      <Item label="Rifiutati" value={String(rifiutati)} />
      <Item label="Interventi" value={String(interventi)} />
      {mostraValore && <Item label="Valore totale" value={`${valore.toFixed(2)} €`} />}
    </div>
  );
}

/** Dettaglio di una foglia: due tab (Riepilogo / Interventi). */
function FogliaDettaglio({ area, onIndietro }: { area: Area; onIndietro: () => void }) {
  const codice = area.codice;
  const usaContabilita = area.usa_contabilita;
  const [coda, setCoda] = useState<CodaRiga[]>([]);
  const [tabella, setTabella] = useState<TabRiga[]>([]);
  const [link, setLink] = useState<LinkRow[]>([]);
  const [rifiutati, setRifiutati] = useState<RifiutataRiga[]>([]);
  const [contabilitaPer, setContabilitaPer] = useState<string | null>(null);
  const [genera, setGenera] = useState(false);
  const [inserimento, setInserimento] = useState(false);
  const [apertoId, setApertoId] = useState<string | null>(null);
  const [mostraRifiutati, setMostraRifiutati] = useState(false);
  const [tab, setTab] = useState<'riepilogo' | 'interventi'>('riepilogo');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Ordinamento + filtri per colonna della tabella Interventi (client-side).
  const [sortKey, setSortKey] = useState<ColKey | null>('data');
  const [sortAsc, setSortAsc] = useState(false);
  const [filtri, setFiltri] = useState<Partial<Record<ColKey, string>>>({});

  const periodoQS = useMemo(() => {
    const p = new URLSearchParams({ area: codice });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [codice, from, to]);

  const carica = useCallback(async () => {
    const [c, t, l, rf] = await Promise.all([
      fetch(`/api/admin/pi/coda?area=${codice}`, { cache: 'no-store' }),
      fetch(`/api/admin/pi/interventi?${periodoQS}`, { cache: 'no-store' }),
      fetch(`/api/admin/pi/token?area=${codice}`, { cache: 'no-store' }),
      fetch(`/api/admin/pi/rifiutati?area=${codice}`, { cache: 'no-store' }),
    ]);
    if (c.ok) setCoda((await c.json()).righe ?? []);
    if (t.ok) setTabella((await t.json()).righe ?? []);
    if (l.ok) setLink((await l.json()).token ?? []);
    if (rf.ok) setRifiutati((await rf.json()).righe ?? []);
  }, [codice, periodoQS]);

  useEffect(() => { void carica(); }, [carica]);

  function toggleSort(k: ColKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(true); }
  }

  // Righe visibili: filtro per colonna (substring, case-insensitive) + ordinamento.
  const righeVisibili = useMemo(() => {
    const attivi = Object.entries(filtri).filter(([, v]) => (v ?? '').trim() !== '') as [ColKey, string][];
    let out = tabella.filter((r) =>
      attivi.every(([k, v]) => valoreCol(r, k).toLowerCase().includes(v.trim().toLowerCase())),
    );
    if (sortKey) {
      const k = sortKey;
      out = [...out].sort((a, b) => {
        let av: string | number, bv: string | number;
        if (k === 'valore') { av = a.valore ?? 0; bv = b.valore ?? 0; }
        else if (k === 'data') { av = a.data ?? ''; bv = b.data ?? ''; }
        else { av = valoreCol(a, k).toLowerCase(); bv = valoreCol(b, k).toLowerCase(); }
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      });
    }
    return out;
  }, [tabella, filtri, sortKey, sortAsc]);

  const valoreTotale = useMemo(() => tabella.reduce((acc, r) => acc + (r.valore ?? 0), 0), [tabella]);

  async function approva(id: string) {
    await fetch(`/api/admin/pi/interventi/${id}/approva`, { method: 'POST' });
    void carica();
  }
  async function rifiuta(id: string) {
    const motivo = window.prompt('Motivo del rifiuto (opzionale):') ?? undefined;
    await fetch(`/api/admin/pi/interventi/${id}/rifiuta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
    });
    void carica();
  }
  /** Riapre un rapportino → torna in coda (in_attesa). `avviso` per il caso approvato. */
  async function riapri(id: string, avviso: boolean) {
    const msg = avviso
      ? 'Riaprire questo rapportino? Tornerà in approvazione e l’eventuale contabilità già inserita verrà cancellata.'
      : 'Riaprire questo rapportino rifiutato? Tornerà in approvazione, modificabile dall’operatore con link aperto.';
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/admin/pi/interventi/${id}/riapri`, { method: 'POST' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error || 'Errore nella riapertura.'); }
    void carica();
  }

  const tabBtn = (k: 'riepilogo' | 'interventi', label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-[var(--brand-primary)] text-[var(--on-primary)]' : 'border border-[var(--brand-border)] hover:border-[var(--brand-primary)]'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onIndietro} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--brand-primary)]">← Sottomoduli</button>
        <h2 className="text-lg font-semibold">{area.label}</h2>
        <div className="ml-auto flex items-center gap-2">
          {tabBtn('riepilogo', 'Riepilogo')}
          {tabBtn('interventi', 'Interventi')}
        </div>
      </div>

      {tab === 'riepilogo' && (
        <div className="space-y-5">
          <StrisciaConteggi inAttesa={coda.length} rifiutati={rifiutati.length} interventi={tabella.length} valore={valoreTotale} mostraValore={usaContabilita} />

          <div className="flex justify-end">
            <button type="button" onClick={() => setGenera((v) => !v)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--brand-primary)]">
              {genera ? 'Chiudi' : 'Genera link'}
            </button>
          </div>
          {genera && <GeneraLink area={codice} onCreato={() => void carica()} />}

          {/* Storico link della foglia (con toggle Apri/Chiudi) */}
          <StoricoLink righe={link} onCambiato={() => void carica()} />

          {/* Coda di approvazione */}
          <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
            <h3 className="mb-3 text-base font-semibold">In approvazione ({coda.length})</h3>
            {coda.length === 0 ? (
              <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
            ) : (
              <ul className="space-y-2">
                {coda.map((r) => (
                  <li key={r.id} className="rounded-lg border border-[var(--brand-border)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s(r.indirizzo) || '—'} · {s(r.comune)}</div>
                        <div className="text-xs text-[var(--brand-text-muted)]">
                          {fmtData(r.data)} · {r.esecutore ?? '—'} · n° {s(r.n_segnalazione) || '—'} · {s(r.ora_inizio)}–{s(r.ora_fine)}
                          {r.anomalia_reperibilita && <span className="ml-2 font-semibold text-[var(--danger)]">⚠ anomalia reperibilità</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setApertoId(apertoId === r.id ? null : r.id)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium">{apertoId === r.id ? 'Chiudi' : 'Apri'}</button>
                        <button type="button" onClick={() => approva(r.id)} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--on-primary)]">Approva</button>
                        <button type="button" onClick={() => rifiuta(r.id)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium text-[var(--danger)]">Rifiuta</button>
                      </div>
                    </div>
                    {apertoId === r.id && (
                      <div className="mt-3 grid gap-x-4 gap-y-2 border-t border-[var(--brand-border)] pt-3 sm:grid-cols-2">
                        <CampoMod label="N° segnalazione"><EditableCell id={r.id} campo="n_segnalazione" valore={s(r.n_segnalazione)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Data"><EditableCell id={r.id} campo="data" tipo="data" valore={s(r.data)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Comune"><EditableCell id={r.id} campo="comune" valore={s(r.comune)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Indirizzo"><EditableCell id={r.id} campo="indirizzo" valore={s(r.indirizzo)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Ora inizio"><EditableCell id={r.id} campo="ora_inizio" tipo="ora" valore={s(r.ora_inizio)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Ora fine"><EditableCell id={r.id} campo="ora_fine" tipo="ora" valore={s(r.ora_fine)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Assistente TE"><EditableCell id={r.id} campo="assistente_te" valore={s(r.assistente_te)} onSaved={carica} /></CampoMod>
                        <CampoMod label="Note"><EditableCell id={r.id} campo="note" valore={s(r.note)} onSaved={carica} /></CampoMod>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Rifiutati (collassabile): da qui si riaprono */}
          <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
            <button type="button" onClick={() => setMostraRifiutati((v) => !v)} className="flex w-full items-center justify-between text-base font-semibold">
              <span>Rifiutati ({rifiutati.length})</span>
              <span className="text-sm text-[var(--brand-text-muted)]">{mostraRifiutati ? '▲' : '▼'}</span>
            </button>
            {mostraRifiutati && (
              rifiutati.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--brand-text-muted)]">Nessun rapportino rifiutato.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {rifiutati.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s(r.indirizzo) || '—'} · {s(r.comune)}</div>
                        <div className="text-xs text-[var(--brand-text-muted)]">
                          {fmtData(r.data)} · {r.esecutore ?? '—'} · n° {s(r.n_segnalazione) || '—'}
                          {r.motivo_rifiuto ? ` · motivo: ${r.motivo_rifiuto}` : ''}
                          {r.anomalia_reperibilita && <span className="ml-2 font-semibold text-[var(--danger)]">⚠ anomalia</span>}
                        </div>
                      </div>
                      <button type="button" onClick={() => riapri(r.id, false)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand-primary)]">Riapri</button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </div>
      )}

      {tab === 'interventi' && (
      <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-base font-semibold">Interventi ({righeVisibili.length}{righeVisibili.length !== tabella.length ? ` / ${tabella.length}` : ''})</h3>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => setInserimento(true)} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--on-primary)]">+ Inserisci intervento</button>
            {(Object.values(filtri).some((v) => (v ?? '').trim() !== '') || sortKey !== 'data' || sortAsc) && (
              <button type="button" onClick={() => { setFiltri({}); setSortKey('data'); setSortAsc(false); }} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)]">Azzera filtri</button>
            )}
            <label className="flex flex-col text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">Dal
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col text-[10px] uppercase tracking-wide text-[var(--brand-text-muted)]">Al
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-sm" />
            </label>
            <a href={`/api/admin/pi/export?${periodoQS}`} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--brand-primary)]">Esporta Excel</a>
          </div>
        </div>
        <p className="mb-2 text-xs text-[var(--brand-text-muted)]">Celle modificabili per correzioni: scrivi e clicca fuori per salvare.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--brand-border)] text-left align-top text-xs text-[var(--brand-text-muted)]">
                {COLONNE.filter((c) => !c.soloContab || usaContabilita).map((c) => (
                  <th key={c.key} className={`py-2 pr-3 ${c.right ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-[var(--brand-text-main)] ${c.right ? 'ml-auto' : ''}`}
                      title="Ordina"
                    >
                      {c.label}{sortKey === c.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                    </button>
                    <input
                      type="text"
                      value={filtri[c.key] ?? ''}
                      onChange={(e) => setFiltri((f) => ({ ...f, [c.key]: e.target.value }))}
                      placeholder="filtra"
                      aria-label={`Filtra per ${c.label}`}
                      className="mt-1 w-full min-w-[4.5rem] rounded border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-0.5 text-xs font-normal normal-case text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </th>
                ))}
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {righeVisibili.length === 0 && (
                <tr><td colSpan={usaContabilita ? 11 : 10} className="py-6 text-center text-sm text-[var(--brand-text-muted)]">{tabella.length === 0 ? 'Nessun intervento approvato.' : 'Nessun intervento con i filtri selezionati.'}</td></tr>
              )}
              {righeVisibili.map((r) => (
                <tr key={r.id} className="border-b border-[var(--brand-border)] align-top">
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="n_segnalazione" valore={s(r.n_segnalazione)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="data" tipo="data" valore={s(r.data)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="comune" valore={s(r.comune)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="indirizzo" valore={s(r.indirizzo)} onSaved={carica} /></td>
                  <td className="py-1.5 pr-3 text-[var(--brand-text-muted)]">{r.esecutore ?? '—'}</td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="ora_inizio" tipo="ora" valore={s(r.ora_inizio)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="ora_fine" tipo="ora" valore={s(r.ora_fine)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="assistente_te" valore={s(r.assistente_te)} onSaved={carica} /></td>
                  <td className="py-1 pr-2"><EditableCell id={r.id} campo="note" valore={s(r.note)} onSaved={carica} /></td>
                  {usaContabilita && <td className="py-1.5 pr-3 text-right font-medium">{r.valore ? `${r.valore.toFixed(2)} €` : '—'}</td>}
                  <td className="py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => { void condividiPdfTab(r).catch(() => {}); }} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs font-medium" title="Genera PDF rapportino">PDF</button>
                      {usaContabilita && r.intervento_id && (
                        <button type="button" onClick={() => setContabilitaPer(r.intervento_id)} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs font-medium">Contabilità</button>
                      )}
                      <button type="button" onClick={() => riapri(r.id, true)} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs font-medium text-[var(--danger)] hover:border-[var(--danger)]" title="Riapri: torna in approvazione">Riapri</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {contabilitaPer && (
        <PannelloContabilita
          interventoId={contabilitaPer}
          onClose={() => setContabilitaPer(null)}
          onSaved={() => { setContabilitaPer(null); void carica(); }}
        />
      )}

      {inserimento && (
        <ModalePIBackoffice
          area={codice}
          links={link.map((l) => ({ id: l.id, valido_dal: l.valido_dal, valido_al: l.valido_al, note: l.note, revocato_at: l.revocato_at }))}
          onClose={() => setInserimento(false)}
          onSaved={() => { setInserimento(false); setTab('interventi'); void carica(); }}
        />
      )}
    </div>
  );
}

function GeneraLink({ area, onCreato }: { area: string; onCreato: () => void }) {
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function genera() {
    setErrore(null); setUrl(null);
    const res = await fetch('/api/admin/pi/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_codice: area, valido_dal: dal, valido_al: al, note: note || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErrore(j.error ?? 'Errore'); return; }
    setUrl(`${window.location.origin}/pi/${j.token}`);
    onCreato();
  }

  const inputCls = 'rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm';
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-[var(--brand-text-muted)]">Dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} className={inputCls} /></label>
        <label className="flex flex-col text-xs text-[var(--brand-text-muted)]">Al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} className={inputCls} /></label>
        <label className="flex flex-1 flex-col text-xs text-[var(--brand-text-muted)]">Note<input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="es. Reperibilità sett. 26" className={inputCls} /></label>
        <button type="button" onClick={genera} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]">Genera</button>
      </div>
      {errore && <p className="mt-2 text-sm text-[var(--danger)]">{errore}</p>}
      {url && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--brand-surface-muted)] p-2">
          <code className="flex-1 truncate text-xs">{url}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(url)} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs font-medium">Copia</button>
        </div>
      )}
    </div>
  );
}
