'use client';

import { useCallback, useEffect, useState } from 'react';

type ImportRow = { import_id: string; righe: number; caricato_at: string; indirizzo_campione: string | null };
type Esito = { type: 'ok' | 'err'; msg: string } | null;

const ENDPOINT = '/api/admin/risanamento/import-misuratori';

export default function ImportMisuratoriClient() {
  const [lista, setLista] = useState<ImportRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Esito>(null);
  const [fIndirizzo, setFIndirizzo] = useState('');
  const [fCivico, setFCivico] = useState('');
  const [fComune, setFComune] = useState('');
  const [fImport, setFImport] = useState('');
  const [refCount, setRefCount] = useState<number | null>(null);
  const [refSample, setRefSample] = useState<Array<{ id: number; matricola: string; indirizzo: string; civico: string; comune: string }>>([]);

  const carica = useCallback(async () => {
    const res = await fetch(ENDPOINT);
    if (res.ok) setLista((await res.json()) as ImportRow[]);
    else setEsito({ type: 'err', msg: 'Impossibile caricare la lista (DB non ancora migrato?).' });
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const importa = async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        const extra = typeof json.inseriti_parziali === 'number' ? ` (inserite ${json.inseriti_parziali} righe prima dell'errore)` : '';
        setEsito({ type: 'err', msg: `${json.error ?? 'Import fallito.'}${extra}` });
        return;
      }
      setEsito({ type: 'ok', msg: `Importati ${json.inseriti} misuratori (scartate ${json.scartate}).` });
      setFile(null);
      await carica();
    } catch {
      setEsito({ type: 'err', msg: 'Errore di rete.' });
    } finally {
      setBusy(false);
    }
  };

  const queryRef = () => {
    const p = new URLSearchParams();
    if (fIndirizzo.trim()) p.set('indirizzo', fIndirizzo.trim());
    if (fCivico.trim()) p.set('civico', fCivico.trim());
    if (fComune.trim()) p.set('comune', fComune.trim());
    if (fImport) p.set('import_id', fImport);
    return p;
  };

  const cercaRef = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/risanamento/misuratori-ref?${queryRef().toString()}`);
      if (!res.ok) { setEsito({ type: 'err', msg: 'Ricerca fallita.' }); return; }
      const json = (await res.json()) as { count: number; sample: typeof refSample };
      setRefCount(json.count);
      setRefSample(json.sample);
    } finally { setBusy(false); }
  };

  const eliminaRef = async () => {
    const p = queryRef();
    if ([...p.keys()].length === 0) { setEsito({ type: 'err', msg: 'Imposta almeno un filtro prima di eliminare.' }); return; }
    if (!confirm(`Eliminare ${refCount ?? '?'} righe di riferimento corrispondenti ai filtri?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/risanamento/misuratori-ref?${p.toString()}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setEsito({ type: 'err', msg: json.error ?? 'Eliminazione fallita.' }); return; }
      setEsito({ type: 'ok', msg: `Eliminate ${json.eliminati} righe di riferimento.` });
      setRefCount(null); setRefSample([]);
      await carica();
    } finally { setBusy(false); }
  };

  const elimina = async (importId: string) => {
    if (!confirm('Eliminare questo import e tutti i suoi misuratori?')) return;
    setBusy(true);
    try {
      const res = await fetch(`${ENDPOINT}?import_id=${encodeURIComponent(importId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setEsito({ type: 'err', msg: json.error ?? 'Eliminazione fallita.' });
        return;
      }
      await carica();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[var(--brand-text-main)]">Estrazione misuratori (risanamento)</h1>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Importa estrazione</h2>
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          File Excel/CSV con colonne: Matricola (obbligatoria), PDR, Nominativo, Indirizzo, Civico, Comune, CAP.
        </p>
        <label htmlFor="file-import" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          File estrazione
        </label>
        <input
          id="file-import"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--brand-text-main)]"
        />
        <button
          type="button"
          disabled={!file || busy}
          onClick={importa}
          className="mt-4 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Import in corso…' : 'Importa'}
        </button>
        {esito && (
          <p className={`mt-3 text-sm ${esito.type === 'ok' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {esito.msg}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--brand-text-main)]">Import caricati</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun import presente.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((imp) => (
              <li key={imp.import_id} className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                <div className="text-sm text-[var(--brand-text-main)]">
                  <span className="font-medium">{imp.righe} misuratori</span>
                  <span className="ml-2 text-xs text-[var(--brand-text-muted)]">
                    {new Date(imp.caricato_at).toLocaleString('it-IT')}{imp.indirizzo_campione ? ` · es. ${imp.indirizzo_campione}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => elimina(imp.import_id)}
                  className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Pulizia righe di riferimento</h2>
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          A lavori ultimati in una via, elimina i misuratori mai lavorati. Imposta almeno un filtro.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={fIndirizzo} onChange={(e) => setFIndirizzo(e.target.value)} placeholder="Via"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Via" />
          <input value={fCivico} onChange={(e) => setFCivico(e.target.value)} placeholder="Civico"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Civico" />
          <input value={fComune} onChange={(e) => setFComune(e.target.value)} placeholder="Comune"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Comune" />
          <select value={fImport} onChange={(e) => setFImport(e.target.value)}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs" aria-label="Import">
            <option value="">Tutti gli import</option>
            {lista.map((imp) => <option key={imp.import_id} value={imp.import_id}>{imp.righe} · {new Date(imp.caricato_at).toLocaleDateString('it-IT')}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={cercaRef}
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-50">
            Cerca
          </button>
          {refCount !== null && (
            <>
              <span className="text-xs text-[var(--brand-text-muted)]">{refCount} corrispondenti</span>
              <button type="button" disabled={busy || refCount === 0} onClick={eliminaRef}
                className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50">
                Elimina {refCount}
              </button>
            </>
          )}
        </div>
        {refSample.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-[var(--brand-text-muted)]">
            {refSample.map((r) => (
              <li key={r.id}>{r.matricola} · {r.indirizzo} {r.civico} {r.comune}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
