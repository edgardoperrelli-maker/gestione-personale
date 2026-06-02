'use client';

import { useState } from 'react';
import AuthGate from '@/components/AuthGate';
import { formatImportSummary, type ImportInterventiResult } from '@/lib/interventi/importSummary';
import GeocodePanel from '@/components/modules/interventi/GeocodePanel';
import Link from 'next/link';

const COMMITTENTI = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'acea', label: 'Acea' },
  { value: 'altro', label: 'Altro' },
] as const;

type Committente = (typeof COMMITTENTI)[number]['value'];

/** Data odierna in fuso Europe/Rome, formato YYYY-MM-DD per <input type="date">. */
function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default function InterventiImportPage() {
  return (
    <AuthGate>
      <ImportInterventiForm />
    </AuthGate>
  );
}

function ImportInterventiForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('Nessun file selezionato');
  const [committente, setCommittente] = useState<Committente>('italgas');
  const [data, setData] = useState<string>(() => oggiIso());
  const [lotto, setLotto] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportInterventiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileName(f ? f.name : 'Nessun file selezionato');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError('Seleziona un file Excel.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setError('Data non valida.');
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('committente', committente);
      fd.append('data', data);
      if (lotto) fd.append('lotto', lotto);

      const res = await fetch('/api/interventi/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Errore durante l\'import.');
        return;
      }
      setResult(json as ImportInterventiResult);
      setFile(null);
      setFileName('Nessun file selezionato');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di rete.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!file && /^\d{4}-\d{2}-\d{2}$/.test(data) && !busy;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
        >
          Interventi · Import
        </span>
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Importa interventi
        </h1>
        <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--brand-text-muted)' }}>
          Carica un Excel del committente: le righe vengono salvate come interventi. Un ri-import dello stesso
          giorno aggiorna le righe esistenti (dedup per committente, ODL e data) invece di duplicarle.
        </p>
        <Link
          href="/hub/interventi/lista"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Vedi lista interventi
        </Link>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-[28px] border bg-[var(--brand-surface)] p-6 shadow-sm"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <div className="space-y-2">
          <div
            className="block text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--brand-text-muted)' }}
          >
            File Excel
          </div>
          <div
            className="flex flex-col gap-4 rounded-[24px] border border-dashed p-5 md:flex-row md:items-center md:justify-between"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
              {fileName}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="interventi-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={onPick}
                onClick={(e) => {
                  // Azzera il valore prima di riaprire il picker: così ri-selezionare
                  // lo stesso file fa comunque scattare onChange (ri-import dello stesso file).
                  (e.target as HTMLInputElement).value = '';
                }}
                className="hidden"
              />
              <label
                htmlFor="interventi-file-input"
                className="inline-flex cursor-pointer items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {file ? 'Sostituisci file' : 'Carica file'}
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFileName('Nessun file selezionato');
                    setResult(null);
                  }}
                  className="rounded-2xl border px-4 py-2 text-sm font-medium transition"
                  style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label
              htmlFor="committente-select"
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Committente
            </label>
            <select
              id="committente-select"
              value={committente}
              onChange={(e) => setCommittente(e.target.value as Committente)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            >
              {COMMITTENTI.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="data-input"
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Data di lavoro
            </label>
            <input
              id="data-input"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="lotto-select"
              className="block text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--brand-text-muted)' }}
            >
              Lotto (Acea)
            </label>
            <select
              id="lotto-select"
              value={lotto}
              onChange={(e) => setLotto(e.target.value)}
              className="w-full rounded-2xl border px-4 py-3 text-base outline-none transition"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' }}
            >
              <option value="">—</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        </div>

        {error && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}
        {result && (
          <div
            className="rounded-2xl border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
          >
            Import completato ({result.committente}, {result.data}): {formatImportSummary(result)}.
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {busy ? 'Import in corso…' : 'Importa'}
        </button>
      </form>

      {result && <GeocodePanel batchId={result.batchId} />}
    </main>
  );
}
