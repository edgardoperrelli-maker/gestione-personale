'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import MicroareaMultiSelect from '@/components/modules/sopralluoghi/MicroareaMultiSelect';
import RegistrazioneInterventiPanel from '@/components/modules/sopralluoghi/RegistrazioneInterventiPanel';
import type { Activity, Territory } from '@/types';

const MappaRisanamento = dynamic(
  () => import('./MappaRisanamento'),
  { ssr: false, loading: () => <MappaLoading /> },
);

export type MicroareaStats = {
  territorio_id: string | null;
  activity_id: string | null;
  activity_name: string | null;
  comune: string | null;
  microarea: string;
  totale_civici: number;
  visitati: number;
  programmati: number;
  da_visitare: number;
  idonei_risanamento: number;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  lat_centro: number;
  lon_centro: number;
};

type PDFGenerato = {
  id: number;
  microarea: string;
  territorio_id: string | null;
  activity_id: string | null;
  comune: string | null;
  num_civici: number;
  data_generazione: string;
  stato_registrazione: string;
  pdf_url: string | null;
  excel_url: string | null;
};

type Props = {
  territories: Territory[];
  activities: Activity[];
  microareeStats: MicroareaStats[];
  pdfGenerati: PDFGenerato[];
  canManage: boolean;
  initialTab: 'pianificazione' | 'registrazione';
};

function MappaLoading() {
  return (
    <div className="flex h-[600px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-gray-50">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-[var(--brand-primary)]" />
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Caricamento mappa...</p>
      </div>
    </div>
  );
}

function triggerFileDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export default function RisanamentoClient({
  territories,
  activities,
  microareeStats,
  pdfGenerati,
  canManage,
  initialTab,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Props['initialTab']>(initialTab);
  const [territorioSelezionato, setTerritorioSelezionato] = useState<string>('');
  const [attivitaSelezionata, setAttivitaSelezionata] = useState<string>('');
  const [comuneSelezionato, setComuneSelezionato] = useState<string>('');
  const [filtroStato, setFiltroStato] = useState<'tutti' | 'da_visitare' | 'visitati' | 'programmati'>('tutti');
  const [microareeSelezionate, setMicroareeSelezionate] = useState<string[]>([]);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const territoryName = territories.find((territory) => territory.id === territorioSelezionato)?.name;
  const activityName = activities.find((activity) => activity.id === attivitaSelezionata)?.name;

  const statsPerTerritorioAttivita = useMemo(
    () => microareeStats.filter((stats) => (
      stats.territorio_id === territorioSelezionato
      && stats.activity_id === attivitaSelezionata
    )),
    [attivitaSelezionata, microareeStats, territorioSelezionato],
  );

  const comuneOptions = useMemo(
    () => Array.from(
      new Set(
        statsPerTerritorioAttivita
          .map((stats) => stats.comune?.trim() ?? '')
          .filter((comune) => comune.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, 'it')),
    [statsPerTerritorioAttivita],
  );

  useEffect(() => {
    if (comuneOptions.length === 1 && !comuneSelezionato) {
      setComuneSelezionato(comuneOptions[0]);
      return;
    }

    if (comuneSelezionato && !comuneOptions.includes(comuneSelezionato)) {
      setComuneSelezionato('');
    }
  }, [comuneOptions, comuneSelezionato]);

  const statsPerScope = useMemo(
    () => statsPerTerritorioAttivita.filter((stats) => stats.comune === comuneSelezionato),
    [comuneSelezionato, statsPerTerritorioAttivita],
  );

  const statsFiltered = useMemo(
    () => statsPerScope.filter((stats) => {
      if (filtroStato === 'da_visitare') return stats.visitati === 0 && stats.programmati === 0;
      if (filtroStato === 'visitati') return stats.visitati > 0;
      if (filtroStato === 'programmati') return stats.programmati > 0;
      return true;
    }),
    [filtroStato, statsPerScope],
  );

  const microareaOptions = useMemo(
    () => Array.from(new Set(statsPerScope.map((stats) => stats.microarea))).sort((left, right) => left.localeCompare(right)),
    [statsPerScope],
  );

  useEffect(() => {
    setMicroareeSelezionate((prev) => prev.filter((microarea) => (
      statsPerScope.some((stats) => stats.microarea === microarea)
    )));
  }, [statsPerScope]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeTab === 'registrazione') {
      url.searchParams.set('tab', 'registrazione');
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [activeTab]);

  const totCivici = statsPerScope.reduce((sum, stats) => sum + stats.totale_civici, 0);
  const totVisitati = statsPerScope.reduce((sum, stats) => sum + stats.visitati, 0);
  const totIdonei = statsPerScope.reduce((sum, stats) => sum + stats.idonei_risanamento, 0);

  const microareeStatsSelezionate = statsPerScope.filter((stats) => microareeSelezionate.includes(stats.microarea));
  const selectionCount = microareeSelezionate.length;
  const selectionCivici = microareeStatsSelezionate.reduce((sum, stats) => sum + stats.totale_civici, 0);
  const selectionVisitati = microareeStatsSelezionate.reduce((sum, stats) => sum + stats.visitati, 0);
  const selectionIdonei = microareeStatsSelezionate.reduce((sum, stats) => sum + stats.idonei_risanamento, 0);
  const pdfMicroareeSelezionate = pdfGenerati.filter((pdf) => (
    pdf.territorio_id === territorioSelezionato
    && pdf.activity_id === attivitaSelezionata
    && pdf.comune === comuneSelezionato
    && microareeSelezionate.includes(pdf.microarea)
  ));

  const toggleMicroareaSelection = (microarea: string) => {
    setMicroareeSelezionate((prev) => (
      prev.includes(microarea)
        ? prev.filter((item) => item !== microarea)
        : [...prev, microarea].sort((left, right) => left.localeCompare(right, 'it'))
    ));
  };

  const handleGeneraPDF = async () => {
    if (!canManage) return;
    if (!territorioSelezionato || !attivitaSelezionata || !comuneSelezionato || microareeSelezionate.length === 0) {
      alert('Seleziona prima territorio, tipologia lavoro, comune e almeno una microarea.');
      return;
    }

    setGenerandoPdf(true);
    try {
      const response = await fetch('/api/sopralluoghi/genera-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microaree: microareeSelezionate,
          territorio_id: territorioSelezionato,
          activity_id: attivitaSelezionata,
          comune: comuneSelezionato,
        }),
      });

      const data = (await response.json()) as {
        pdf_url?: string;
        excel_url?: string;
        generated?: Array<{ microarea: string; pdf_url: string; excel_url: string }>;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Errore generazione PDF');
      }

      if (data.pdf_url) {
        window.open(data.pdf_url, '_blank');
      }

      if (data.excel_url) {
        triggerFileDownload(data.excel_url);
      } else if (Array.isArray(data.generated) && data.generated.length > 1) {
        alert(data.message ?? `Generati PDF ed Excel per ${data.generated.length} microaree.`);
      }

      router.refresh();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!territorioSelezionato || !attivitaSelezionata || !comuneSelezionato) {
      alert('Seleziona prima territorio, tipologia lavoro e comune.');
      return;
    }

    setExportingExcel(true);
    try {
      const response = await fetch('/api/sopralluoghi/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          territorio_id: territorioSelezionato,
          activity_id: attivitaSelezionata,
          comune: comuneSelezionato,
          solo_idonei: true,
          stato: 'visitato',
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? 'Errore export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Civici_Programmati_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <div className="text-sm text-[var(--text-secondary)]">Territorio</div>
          <select
            value={territorioSelezionato}
            onChange={(event) => setTerritorioSelezionato(event.target.value)}
            className="mt-2 w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
          >
            <option value="">Seleziona un territorio</option>
            {territories.map((territory) => (
              <option key={territory.id} value={territory.id}>
                {territory.name}
              </option>
            ))}
          </select>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">Tipologia lavoro</div>
          <select
            value={attivitaSelezionata}
            onChange={(event) => setAttivitaSelezionata(event.target.value)}
            className="mt-2 w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
          >
            <option value="">Seleziona una tipologia</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
              ))}
            </select>
          <div className="mt-3 text-sm text-[var(--text-secondary)]">Comune</div>
          <select
            value={comuneSelezionato}
            onChange={(event) => setComuneSelezionato(event.target.value)}
            disabled={statsPerTerritorioAttivita.length === 0}
            className="mt-2 w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
          >
            <option value="">Seleziona un comune</option>
            {comuneOptions.map((comune) => (
              <option key={comune} value={comune}>
                {comune}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <div className="text-sm text-[var(--text-secondary)]">Civici Totali</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
            {totCivici.toLocaleString('it-IT')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <div className="text-sm text-[var(--text-secondary)]">Visitati</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">
            {totVisitati.toLocaleString('it-IT')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          <div className="text-sm text-[var(--text-secondary)]">Idonei</div>
          <div className="mt-1 text-2xl font-semibold text-blue-600">
            {totIdonei.toLocaleString('it-IT')}
          </div>
        </div>
      </div>

      {(!territorioSelezionato || !attivitaSelezionata || !comuneSelezionato) && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6 text-sm text-[var(--text-secondary)]">
          Seleziona territorio, tipologia lavoro e comune per caricare microaree, PDF e registrazione manuale collegati agli import effettuati.
        </div>
      )}

      {territorioSelezionato && attivitaSelezionata && comuneSelezionato && activeTab === 'pianificazione' && (
        <>
          <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                Stato microarea
              </label>
              <select
                value={filtroStato}
                onChange={(event) => setFiltroStato(event.target.value as typeof filtroStato)}
                className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="tutti">Tutte le microaree</option>
                <option value="da_visitare">Da visitare</option>
                <option value="visitati">Con sopralluoghi</option>
                <option value="programmati">Programmati</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={handleExportExcel}
                disabled={exportingExcel || statsPerScope.length === 0}
              >
                {exportingExcel ? 'Esportando...' : 'Export Excel'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4">
            <MicroareaMultiSelect
              label="Microaree selezionate"
              options={microareaOptions}
              selected={microareeSelezionate}
              onChange={setMicroareeSelezionate}
              helperText="Puoi selezionare piu microaree anche cliccando direttamente sulla mappa."
              emptyText="Nessuna microarea disponibile per il filtro corrente."
            />
          </div>

          {statsFiltered.length > 0 ? (
            <MappaRisanamento
              microareeStats={statsFiltered}
              onMicroareaClick={toggleMicroareaSelection}
              microareeSelezionate={microareeSelezionate}
            />
          ) : (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-6 text-sm text-[var(--text-secondary)]">
              Nessuna microarea disponibile per territorio, tipologia lavoro e comune selezionati.
            </div>
          )}

          {microareeSelezionate.length > 0 && (
            <div className="rounded-lg border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-medium text-[var(--text-primary)]">
                    {selectionCount === 1
                      ? microareeSelezionate[0]
                      : `${selectionCount} microaree selezionate`}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {territoryName ?? 'Territorio selezionato'} - {activityName ?? 'Tipologia selezionata'} - {comuneSelezionato} - {selectionCivici.toLocaleString('it-IT')} civici - {selectionVisitati} visitati - {selectionIdonei} idonei
                  </p>
                  {pdfMicroareeSelezionate.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {pdfMicroareeSelezionate.slice(0, 3).map((pdf) => (
                        <a
                          key={`pdf-selection-${pdf.id}`}
                          href={pdf.pdf_url ?? pdf.excel_url ?? '#'}
                          target={pdf.pdf_url ? '_blank' : undefined}
                          rel={pdf.pdf_url ? 'noopener noreferrer' : undefined}
                          className="inline-block text-sm font-medium text-[var(--brand-primary)] hover:underline"
                        >
                          {pdf.microarea} - {new Date(pdf.data_generazione).toLocaleDateString('it-IT')}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setActiveTab('registrazione')}
                  >
                    Vai a registrazione
                  </Button>
                  {canManage && (
                    <Button
                    variant="primary"
                    size="md"
                    onClick={handleGeneraPDF}
                    disabled={generandoPdf}
                  >
                      {generandoPdf
                        ? 'Generando...'
                        : selectionCount > 1
                          ? 'Genera PDF + Excel per le microaree selezionate'
                          : 'Genera PDF + Excel sopralluogo'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'registrazione' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="md"
              onClick={() => setActiveTab('pianificazione')}
            >
              Torna alla pianificazione
            </Button>
          </div>

          <RegistrazioneInterventiPanel
            canManage={canManage}
            territorioSelezionato={territorioSelezionato}
            territoryName={territoryName}
            attivitaSelezionata={attivitaSelezionata}
            activityName={activityName}
            comuneSelezionato={comuneSelezionato}
            microareeSelezionate={microareeSelezionate}
            microareaOptions={microareaOptions}
            pdfGenerati={pdfGenerati}
            onMicroareeChange={setMicroareeSelezionate}
          />
        </div>
      )}
    </div>
  );
}
