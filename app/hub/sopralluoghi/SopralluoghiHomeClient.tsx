'use client';

import Link from 'next/link';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Button from '@/components/Button';
import type { Territory } from '@/types';

type ImportResult = {
  totale: number;
  inseriti: number;
  errori: number;
  duplicati_scartati?: number;
  microaree: number;
  territorio_id: string;
  territorio_nome: string;
  sorgente?: string;
  warning?: string | null;
};

type Props = {
  territories: Territory[];
  canManage: boolean;
};

function ModuleCard(props: {
  href?: string;
  badge: string;
  badgeClassName: string;
  title: string;
  description: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  const content = (
    <>
      <div className="absolute right-4 top-4">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${props.badgeClassName}`}>
          {props.badge}
        </span>
      </div>

      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--brand-primary-soft)]">
        {props.icon}
      </div>

      <h3 className="text-lg font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--brand-primary)]">
        {props.title}
      </h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{props.description}</p>

      <div className="mt-4 flex items-center text-sm font-medium text-[var(--brand-primary)]">
        {props.disabled ? 'Disponibile per admin' : 'Apri modulo'}
        {!props.disabled && (
          <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </>
  );

  const className = `group relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white p-6 transition-all hover:border-[var(--brand-primary)] hover:shadow-lg ${
    props.disabled ? 'cursor-default opacity-75' : ''
  }`;

  if (!props.href || props.disabled) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={props.href} className={className}>
      {content}
    </Link>
  );
}

export default function SopralluoghiHomeClient({ territories, canManage }: Props) {
  const [territorioSelezionato, setTerritorioSelezionato] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!territorioSelezionato) {
      setErrorMsg('Seleziona prima il territorio di riferimento.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('territorio_id', territorioSelezionato);

      const response = await fetch('/api/sopralluoghi/import-civici', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ImportResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error ?? 'Errore durante il caricamento' : 'Errore durante il caricamento');
      }

      setResult(data as ImportResult);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          Moduli sopralluogo
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          La pianificazione e la registrazione manuale degli interventi confluiscono ora nel modulo Risanamento Colonne Montanti.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ModuleCard
          href="/hub/sopralluoghi/risanamento"
          badge="Attivo"
          badgeClassName="bg-green-100 text-green-700"
          title="Risanamento Colonne Montanti"
          description="Mappa, generazione PDF, statistiche e registrazione manuale degli interventi nello stesso flusso."
          icon={(
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--brand-primary)]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 21h18M3 7v1a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3V7M3 7h18M3 7v14M21 7v14M9 3h6" />
              <path d="M12 11v10" />
            </svg>
          )}
        />

        <ModuleCard
          href={canManage ? '/hub/sopralluoghi/risanamento?tab=registrazione' : undefined}
          badge={canManage ? 'Interno' : 'Admin'}
          badgeClassName={canManage ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}
          title="Registrazione Interventi"
          description="Accesso diretto alla registrazione manuale, ora integrata nel modulo Risanamento senza percorso separato."
          disabled={!canManage}
          icon={(
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--brand-primary)]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 12h6M9 16h6" />
            </svg>
          )}
        />
      </div>

      <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h3 className="text-base font-medium text-[var(--text-primary)]">
              Importa indirizzi per territorio
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Gli indirizzi importati restano memorizzati sul territorio selezionato e vengono riutilizzati in pianificazione e registrazione interventi.
            </p>
            {!canManage && (
              <p className="text-sm text-amber-700">
                Import e registrazione sono disponibili solo per utenze admin.
              </p>
            )}
          </div>

          <div className="w-full max-w-md space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Territorio di riferimento
              </label>
              <select
                value={territorioSelezionato}
                onChange={(event) => setTerritorioSelezionato(event.target.value)}
                disabled={!canManage || uploading}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:cursor-not-allowed disabled:bg-gray-50"
              >
                <option value="">Seleziona un territorio</option>
                {territories.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    {territory.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Button
                variant="primary"
                size="md"
                className="w-full"
                disabled={!canManage || uploading || !territorioSelezionato}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Caricamento...' : 'Seleziona file CSV o Excel (.xls/.xlsx)'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                disabled={!canManage || uploading || !territorioSelezionato}
                onChange={handleUpload}
              />
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-medium">
              Import completato per {result.territorio_nome}
            </div>
            {result.sorgente && (
              <div className="mt-1 text-xs text-green-700">
                Foglio letto: {result.sorgente}
              </div>
            )}
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <div><span className="font-semibold">{result.totale.toLocaleString('it-IT')}</span> righe lette</div>
              <div><span className="font-semibold">{result.inseriti.toLocaleString('it-IT')}</span> righe salvate</div>
              <div><span className="font-semibold">{result.microaree}</span> microaree</div>
              {result.errori > 0 && (
                <div className="text-amber-700"><span className="font-semibold">{result.errori}</span> errori</div>
              )}
            </div>
            {typeof result.duplicati_scartati === 'number' && result.duplicati_scartati > 0 && (
              <div className="mt-2 text-amber-800">
                <span className="font-semibold">{result.duplicati_scartati.toLocaleString('it-IT')}</span> duplicati interni scartati
              </div>
            )}
            {result.warning && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                {result.warning}
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
