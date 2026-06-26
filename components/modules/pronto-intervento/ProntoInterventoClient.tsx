'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PannelloContabilita from './PannelloContabilita';

type Area = { codice: string; label: string; attiva: boolean; ordine: number };
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

export default function ProntoInterventoClient() {
  const [aree, setAree] = useState<Area[]>([]);
  const [area, setArea] = useState<string>('');
  const [coda, setCoda] = useState<CodaRiga[]>([]);
  const [tabella, setTabella] = useState<TabRiga[]>([]);
  const [contabilitaPer, setContabilitaPer] = useState<string | null>(null);
  const [genera, setGenera] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/pi/aree', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const a = (j.aree ?? []) as Area[];
        setAree(a);
        const prima = a.find((x) => x.attiva) ?? a[0];
        if (prima) setArea(prima.codice);
      }
    })();
  }, []);

  const areaAttiva = useMemo(() => aree.find((a) => a.codice === area), [aree, area]);

  const carica = useCallback(async () => {
    if (!area) return;
    const [c, t] = await Promise.all([
      fetch(`/api/admin/pi/coda?area=${area}`, { cache: 'no-store' }),
      fetch(`/api/admin/pi/interventi?area=${area}`, { cache: 'no-store' }),
    ]);
    if (c.ok) setCoda((await c.json()).righe ?? []);
    if (t.ok) setTabella((await t.json()).righe ?? []);
  }, [area]);

  useEffect(() => { if (areaAttiva?.attiva) void carica(); }, [areaAttiva, carica]);

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
      <div>
        <h1 className="text-2xl font-semibold">Pronto Intervento</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">Chiamate P.I. sul campo, approvazione e contabilità.</p>
      </div>

      {/* Foglie territoriali */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--brand-border)]">
        {aree.map((a) => (
          <button
            key={a.codice}
            type="button"
            disabled={!a.attiva}
            onClick={() => a.attiva && setArea(a.codice)}
            className={`relative -mb-px rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              area === a.codice
                ? 'border-x border-t border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--primary-text)]'
                : 'text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
            } ${!a.attiva ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {a.label}
            {!a.attiva && <span className="ml-2 rounded-full bg-[var(--brand-surface-muted)] px-1.5 py-0.5 text-[10px]">in arrivo</span>}
          </button>
        ))}
      </div>

      {!areaAttiva?.attiva ? (
        <div className="rounded-xl border border-dashed border-[var(--brand-border)] p-10 text-center text-sm text-[var(--brand-text-muted)]">
          Foglia “{areaAttiva?.label}” non ancora attiva.
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => setGenera((v) => !v)} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-medium">
              {genera ? 'Chiudi' : 'Genera link'}
            </button>
          </div>
          {genera && <GeneraLink area={area} onCreato={() => void carica()} />}

          {/* Coda di approvazione */}
          <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">In approvazione ({coda.length})</h2>
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
            <h2 className="mb-3 text-base font-semibold">Interventi ({tabella.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--brand-border)] text-left text-xs text-[var(--brand-text-muted)]">
                    <th className="py-2 pr-3">N° segn.</th>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Comune</th>
                    <th className="py-2 pr-3">Indirizzo</th>
                    <th className="py-2 pr-3">Esecutore</th>
                    <th className="py-2 pr-3">Orario</th>
                    <th className="py-2 pr-3">Assist. TE</th>
                    <th className="py-2 pr-3 text-right">Valore</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tabella.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento approvato.</td></tr>
                  )}
                  {tabella.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--brand-border)]">
                      <td className="py-1.5 pr-3 font-mono text-xs">{s(r.n_segnalazione)}</td>
                      <td className="py-1.5 pr-3">{fmtData(r.data)}</td>
                      <td className="py-1.5 pr-3">{s(r.comune)}</td>
                      <td className="py-1.5 pr-3">{s(r.indirizzo)}</td>
                      <td className="py-1.5 pr-3">{r.esecutore ?? '—'}</td>
                      <td className="py-1.5 pr-3">{s(r.ora_inizio)}–{s(r.ora_fine)}</td>
                      <td className="py-1.5 pr-3">{s(r.assistente_te)}</td>
                      <td className="py-1.5 pr-3 text-right font-medium">{r.valore ? `${r.valore.toFixed(2)} €` : '—'}</td>
                      <td className="py-1.5 text-right">
                        {r.intervento_id && (
                          <button type="button" onClick={() => setContabilitaPer(r.intervento_id)} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs font-medium">Contabilità</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

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
