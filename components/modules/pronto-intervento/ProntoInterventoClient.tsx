'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PannelloContabilita from './PannelloContabilita';
import { generaRapportinoManutenzionePdfBlob, nomeFileRapportinoPI } from '@/lib/pi/rapportinoManutenzionePdf';
import { condividiOScarica } from '@/utils/rapportini/condividiFile';

type Area = { codice: string; label: string; attiva: boolean; ordine: number; usa_contabilita: boolean };

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
type CodaRiga = {
  id: string; data: string | null; esecutore: string | null; indirizzo: unknown; comune: unknown;
  n_segnalazione: unknown; ora_inizio: unknown; ora_fine: unknown; assistente_te: unknown; note: unknown;
  anomalia_reperibilita: boolean;
};
type TabRiga = CodaRiga & { intervento_id: string | null; valore: number };

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
    descrizione: s(r.note),
  });
  await condividiOScarica({
    blob, filename: nomeFileRapportinoPI(s(r.n_segnalazione), r.data ?? ''),
    title: 'Rapportino manutenzione', text: `Rapportino P.I. ${s(r.n_segnalazione)}`.trim(),
  });
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
        </button>
      ))}
    </div>
  );
}

/** Dettaglio di una foglia: genera link, coda, tabella, contabilità, export. */
function FogliaDettaglio({ area, onIndietro }: { area: Area; onIndietro: () => void }) {
  const codice = area.codice;
  const usaContabilita = area.usa_contabilita;
  const [coda, setCoda] = useState<CodaRiga[]>([]);
  const [tabella, setTabella] = useState<TabRiga[]>([]);
  const [contabilitaPer, setContabilitaPer] = useState<string | null>(null);
  const [genera, setGenera] = useState(false);
  const [territori, setTerritori] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const periodoQS = useMemo(() => {
    const p = new URLSearchParams({ area: codice });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [codice, from, to]);

  const carica = useCallback(async () => {
    const [c, t] = await Promise.all([
      fetch(`/api/admin/pi/coda?area=${codice}`, { cache: 'no-store' }),
      fetch(`/api/admin/pi/interventi?${periodoQS}`, { cache: 'no-store' }),
    ]);
    if (c.ok) setCoda((await c.json()).righe ?? []);
    if (t.ok) setTabella((await t.json()).righe ?? []);
  }, [codice, periodoQS]);

  useEffect(() => { void carica(); }, [carica]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onIndietro} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--brand-primary)]">← Sottomoduli</button>
        <h2 className="text-lg font-semibold">{area.label}</h2>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setTerritori((v) => !v)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium">
            {territori ? 'Chiudi' : 'Territori'}
          </button>
          <button type="button" onClick={() => setGenera((v) => !v)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium">
            {genera ? 'Chiudi' : 'Genera link'}
          </button>
        </div>
      </div>

      {territori && <GestioneTerritori area={codice} />}
      {genera && <GeneraLink area={codice} onCreato={() => void carica()} />}

      {/* Coda di approvazione */}
      <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">In approvazione ({coda.length})</h3>
        {coda.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
        ) : (
          <ul className="space-y-2">
            {coda.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s(r.indirizzo) || '—'} · {s(r.comune)}</div>
                  <div className="text-xs text-[var(--brand-text-muted)]">
                    {fmtData(r.data)} · {r.esecutore ?? '—'} · n° {s(r.n_segnalazione) || '—'} · {s(r.ora_inizio)}–{s(r.ora_fine)}
                    {r.anomalia_reperibilita && <span className="ml-2 font-semibold text-[var(--danger)]">⚠ anomalia reperibilità</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => approva(r.id)} className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--on-primary)]">Approva</button>
                  <button type="button" onClick={() => rifiuta(r.id)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-medium text-[var(--danger)]">Rifiuta</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tabella interventi approvati */}
      <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-base font-semibold">Interventi ({tabella.length})</h3>
          <div className="flex flex-wrap items-end gap-2">
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
              <tr className="border-b border-[var(--brand-border)] text-left text-xs text-[var(--brand-text-muted)]">
                <th className="py-2 pr-3">N° segn.</th>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Comune</th>
                <th className="py-2 pr-3">Indirizzo</th>
                <th className="py-2 pr-3">Esecutore</th>
                <th className="py-2 pr-3">Ora inizio</th>
                <th className="py-2 pr-3">Ora fine</th>
                <th className="py-2 pr-3">Assist. TE</th>
                <th className="py-2 pr-3">Note</th>
                {usaContabilita && <th className="py-2 pr-3 text-right">Valore</th>}
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tabella.length === 0 && (
                <tr><td colSpan={usaContabilita ? 11 : 10} className="py-6 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento approvato.</td></tr>
              )}
              {tabella.map((r) => (
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {contabilitaPer && (
        <PannelloContabilita
          interventoId={contabilitaPer}
          onClose={() => setContabilitaPer(null)}
          onSaved={() => { setContabilitaPer(null); void carica(); }}
        />
      )}
    </div>
  );
}

function GestioneTerritori({ area }: { area: string }) {
  const [territories, setTerritories] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stato, setStato] = useState<'idle' | 'salvataggio' | 'salvato'>('idle');

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/admin/pi/territori?area=${area}`, { cache: 'no-store' });
      if (!alive || !res.ok) return;
      const j = await res.json();
      setTerritories((j.territories ?? []) as Array<{ id: string; name: string }>);
      setSelected(new Set((j.selected ?? []) as string[]));
    })();
    return () => { alive = false; };
  }, [area]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setStato('idle');
  }

  async function salva() {
    setStato('salvataggio');
    const res = await fetch('/api/admin/pi/territori', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_codice: area, territory_ids: [...selected] }),
    });
    setStato(res.ok ? 'salvato' : 'idle');
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <p className="mb-1 text-sm font-semibold">Territori reperibilità della foglia</p>
      <p className="mb-3 text-xs text-[var(--brand-text-muted)]">La tendina “Esecutore” del link mostra solo i reperibili di questi territori. Nessuna selezione = tutti i territori.</p>
      <div className="grid max-h-56 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
        {territories.map((t) => (
          <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--brand-surface-muted)]">
            <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-[var(--brand-primary)]" />
            {t.name}
          </label>
        ))}
        {territories.length === 0 && <p className="text-sm text-[var(--brand-text-muted)]">Nessun territorio disponibile.</p>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={salva} disabled={stato === 'salvataggio'} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">
          {stato === 'salvataggio' ? 'Salvataggio…' : 'Salva territori'}
        </button>
        {stato === 'salvato' && <span className="text-xs font-semibold text-[var(--success)]">✓ Salvato</span>}
      </div>
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
