'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Button from '@/components/Button';
import Input from '@/components/Input';
import type { Activity, Territory } from '@/types';

type ImportResult = {
  totale: number;
  inseriti: number;
  errori: number;
  duplicati_scartati?: number;
  microaree: number;
  territorio_id: string;
  territorio_nome: string;
  activity_id: string;
  activity_name: string;
  comune: string;
  sorgente?: string;
  warning?: string | null;
};

type DatasetCaricato = {
  territorio_id: string | null;
  territorio_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  comune: string;
  totale_civici: number;
  totale_microaree: number;
  primo_caricamento: string | null;
  ultimo_caricamento: string | null;
  pdf_generati: number;
};

type Props = {
  territories: Territory[];
  activities: Activity[];
  canManage: boolean;
};

function buildDatasetKey(dataset: Pick<DatasetCaricato, 'territorio_id' | 'activity_id' | 'comune'>): string {
  return [
    dataset.territorio_id ?? 'no-territory',
    dataset.activity_id ?? 'no-activity',
    dataset.comune.trim() || 'no-comune',
  ].join('|');
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatComuneLabel(value: string): string {
  return value.trim() || 'Comune non specificato';
}

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

export default function SopralluoghiHomeClient({ territories, activities, canManage }: Props) {
  const [territorioSelezionato, setTerritorioSelezionato] = useState('');
  const [attivitaSelezionata, setAttivitaSelezionata] = useState('');
  const [comuneSelezionato, setComuneSelezionato] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [deletingDatasetKey, setDeletingDatasetKey] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetCaricato[]>([]);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDatasets = useCallback(async () => {
    if (!canManage) return;

    setLoadingDatasets(true);
    setDatasetsError(null);

    try {
      const response = await fetch('/api/sopralluoghi/dataset', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await response.json()) as { datasets?: DatasetCaricato[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Errore caricamento dataset');
      }

      setDatasets(data.datasets ?? []);
    } catch (error: unknown) {
      setDatasetsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDatasets(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadDatasets();
  }, [canManage, loadDatasets]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!territorioSelezionato) {
      setErrorMsg('Seleziona prima il territorio di riferimento.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!attivitaSelezionata) {
      setErrorMsg('Seleziona prima la tipologia di lavoro.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!comuneSelezionato.trim()) {
      setErrorMsg('Inserisci prima il comune di riferimento.');
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
      formData.append('activity_id', attivitaSelezionata);
      formData.append('comune', comuneSelezionato);

      const response = await fetch('/api/sopralluoghi/import-civici', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as ImportResult | { error?: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error ?? 'Errore durante il caricamento' : 'Errore durante il caricamento');
      }

      setResult(data as ImportResult);
      await loadDatasets();
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDataset = async (dataset: DatasetCaricato) => {
    const datasetKey = buildDatasetKey(dataset);
    const datasetLabel = [
      dataset.territorio_name ?? 'Territorio sconosciuto',
      dataset.activity_name ?? 'Tipologia sconosciuta',
      formatComuneLabel(dataset.comune),
    ].join(' - ');

    const confirmed = window.confirm(
      `Eliminare il dataset ${datasetLabel}?\n\nQuesta operazione rimuove civici, registrazioni manuali collegate e PDF/Excel generati per questo scope.`,
    );

    if (!confirmed) return;

    setDeletingDatasetKey(datasetKey);
    setDatasetsError(null);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await fetch('/api/sopralluoghi/dataset', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          territorio_id: dataset.territorio_id,
          activity_id: dataset.activity_id,
          comune: dataset.comune,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Errore eliminazione dataset');
      }

      setDatasets((prev) => prev.filter((item) => buildDatasetKey(item) !== datasetKey));
      setResult(null);
    } catch (error: unknown) {
      setDatasetsError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingDatasetKey(null);
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
              Gli indirizzi importati restano memorizzati sul territorio, sulla tipologia lavoro e sul comune selezionati, e vengono riutilizzati in pianificazione e registrazione interventi.
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
                onChange={(event) => {
                  setTerritorioSelezionato(event.target.value);
                  setResult(null);
                  setErrorMsg(null);
                }}
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
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Tipologia di lavoro
              </label>
              <select
                value={attivitaSelezionata}
                onChange={(event) => {
                  setAttivitaSelezionata(event.target.value);
                  setResult(null);
                  setErrorMsg(null);
                }}
                disabled={!canManage || uploading}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:cursor-not-allowed disabled:bg-gray-50"
              >
                <option value="">Seleziona una tipologia</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Comune di riferimento
              </label>
              <Input
                value={comuneSelezionato}
                onChange={(event) => {
                  setComuneSelezionato(event.target.value.toUpperCase());
                  setResult(null);
                  setErrorMsg(null);
                }}
                disabled={!canManage || uploading}
                placeholder="Es. COLLEFERRO"
              />
            </div>

            <div>
              <Button
                variant="primary"
                size="md"
                className="w-full"
                disabled={!canManage || uploading || !territorioSelezionato || !attivitaSelezionata || !comuneSelezionato.trim()}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Caricamento...' : 'Seleziona file CSV o Excel (.xls/.xlsx)'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                disabled={!canManage || uploading || !territorioSelezionato || !attivitaSelezionata || !comuneSelezionato.trim()}
                onChange={handleUpload}
              />
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-medium">
              Import completato per {result.territorio_nome} - {result.activity_name} - {result.comune}
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

      {canManage && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h3 className="text-base font-medium text-[var(--text-primary)]">
                Mappe caricate
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Ogni riga rappresenta un dataset attualmente caricato nel modulo, raggruppato per territorio, tipologia lavoro e comune.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                La cancellazione rimuove anche registrazioni manuali e PDF/Excel generati collegati a quello scope.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadDatasets()}
              disabled={loadingDatasets}
            >
              {loadingDatasets ? 'Aggiornamento...' : 'Aggiorna lista'}
            </Button>
          </div>

          {datasetsError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {datasetsError}
            </div>
          )}

          {loadingDatasets ? (
            <div className="mt-4 rounded-md border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-6 text-sm text-[var(--brand-text-muted)]">
              Caricamento dataset...
            </div>
          ) : datasets.length === 0 ? (
            <div className="mt-4 rounded-md border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-6 text-sm text-[var(--brand-text-muted)]">
              Nessuna mappa caricata al momento.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--brand-border)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="bg-[var(--brand-bg)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Territorio</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Tipologia</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Comune</th>
                      <th className="px-4 py-3 text-right font-medium text-[var(--brand-text-muted)]">Microaree</th>
                      <th className="px-4 py-3 text-right font-medium text-[var(--brand-text-muted)]">Civici</th>
                      <th className="px-4 py-3 text-right font-medium text-[var(--brand-text-muted)]">PDF</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Ultimo caricamento</th>
                      <th className="px-4 py-3 text-right font-medium text-[var(--brand-text-muted)]">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brand-border)] bg-white">
                    {datasets.map((dataset) => {
                      const datasetKey = buildDatasetKey(dataset);
                      const deleting = deletingDatasetKey === datasetKey;

                      return (
                        <tr key={datasetKey} className="hover:bg-[var(--brand-bg)]/40">
                          <td className="px-4 py-3 text-[var(--brand-text-main)]">
                            {dataset.territorio_name ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-[var(--brand-text-main)]">
                            {dataset.activity_name ?? '-'}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--brand-text-main)]">
                            {formatComuneLabel(dataset.comune)}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--brand-text-main)]">
                            {dataset.totale_microaree.toLocaleString('it-IT')}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--brand-text-main)]">
                            {dataset.totale_civici.toLocaleString('it-IT')}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--brand-text-main)]">
                            {dataset.pdf_generati.toLocaleString('it-IT')}
                          </td>
                          <td className="px-4 py-3 text-[var(--brand-text-muted)]">
                            {formatDateTime(dataset.ultimo_caricamento)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              disabled={deleting}
                              onClick={() => void handleDeleteDataset(dataset)}
                            >
                              {deleting ? 'Eliminazione...' : 'Elimina'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
