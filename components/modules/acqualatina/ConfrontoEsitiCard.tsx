'use client';

import { useId, useRef, useState } from 'react';
import { Download, Scale } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';
import type { ConfrontoEsiti } from '@/lib/acqualatina/confrontoEsiti';

const ENDPOINT = '/api/acqualatina/esiti/confronto';
/** Oltre queste righe la lista si tronca a schermo: il totale resta nel titolo. */
const MAX_RIGHE = 30;

type Esito = ConfrontoEsiti & { righeFile: number; error?: string };

/**
 * Confronto esiti col SITO AcquaLatina, dentro Strumenti.
 *
 * Il sito è dove l'ufficio registra a mano il lavoro fatto; il registro si chiude dai nostri
 * rapportini. Due mani, nessun canale fra loro: questo riquadro prende l'export del sito
 * (file «ESECUZIONI») e dice dove una delle due non ha ancora scritto. SOLO lettura — la
 * correzione resta un gesto di chi guarda il report: gli esiti nostri si sistemano dal modulo
 * interventi (e il registro segue da solo), quelli del sito sul sito.
 */
export default function ConfrontoEsitiCard() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  /**
   * L'export del confronto, per il controllo manuale in ufficio: le liste COMPLETE (a schermo
   * si troncano a MAX_RIGHE), un foglio per coda più il riepilogo dei contatori. Stesso
   * meccanismo dell'export vista del registro: xlsx caricato al click, file costruito dal
   * dato già in memoria — nessuna nuova chiamata, si esporta ciò che il confronto ha detto.
   */
  const esporta = async () => {
    if (!esito) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const riepilogo = XLSX.utils.aoa_to_sheet([
        ['Confronto esiti col sito AcquaLatina'],
        [],
        ['Allineati (sito effettuato, noi chiusi)', esito.allineati],
        ['Manca il nostro esito (sito effettuato, noi aperti)', esito.daChiudereDaNoi.length],
        ['In lavorazione oggi (esclusi dalle code)', esito.inLavorazioneOggi],
        ['Da registrare sul sito (noi chiusi, sito senza esito)', esito.mancantiSulSito.length],
        ['Non esitati dal sito', esito.nonEsitatiSito],
        ['Sconosciuti al registro', esito.sconosciuti.length],
        ['Impianti difformi', esito.impiantiDifformi.length],
        ['Righe nel file', esito.righeFile],
      ]);
      riepilogo['!cols'] = [{ wch: 48 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, riepilogo, 'Riepilogo');

      const daChiudere = XLSX.utils.aoa_to_sheet([
        ['ODL', 'Nome utente', 'Comune', 'Esito sito', 'Data sito', 'Stato da noi'],
        ...esito.daChiudereDaNoi.map((v) => [
          v.odl, v.nominativo ?? '', v.comune ?? '', v.esitoSito, v.dataSito, v.statoNostro,
        ]),
      ]);
      daChiudere['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, daChiudere, 'Manca il nostro esito');

      const daRegistrare = XLSX.utils.aoa_to_sheet([
        ['ODL', 'Nome utente', 'Comune', 'Chiusa il'],
        ...esito.mancantiSulSito.map((v) => [v.odl, v.nominativo ?? '', v.comune ?? '', v.chiusaIl ?? '']),
      ]);
      daRegistrare['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, daRegistrare, 'Da registrare sul sito');

      if (esito.impiantiDifformi.length > 0) {
        const difformi = XLSX.utils.aoa_to_sheet([
          ['ODL', 'Impianto sito', 'Impianto registro'],
          ...esito.impiantiDifformi.map((v) => [v.odl, v.impiantoSito, v.impiantoRegistro]),
        ]);
        difformi['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, difformi, 'Impianti difformi');
      }
      if (esito.sconosciuti.length > 0) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([['ODL'], ...esito.sconosciuti.map((o) => [o])]),
          'Sconosciuti al registro',
        );
      }

      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `confronto-esiti-acqualatina-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export non riuscito.');
    }
  };

  const confronta = async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as Esito;
      if (!res.ok) {
        toast.error(body.error ?? 'Confronto non riuscito.');
        return;
      }
      setEsito(body);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Confronto non riuscito.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Confronto esiti col sito</h2>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          Carica l&apos;export delle esecuzioni del sito AcquaLatina (file «ESECUZIONI»). Il
          confronto è solo in lettura: dice quali ODL il sito dà per fatti mentre da noi sono
          ancora aperti, e quali abbiamo chiuso noi senza che sul sito ci sia l&apos;esito.
          Gli esiti nostri si correggono dal modulo interventi — il registro segue da solo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idFile} className="sr-only">
          File esecuzioni del sito AcquaLatina
        </label>
        <input
          id={idFile}
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full max-w-sm cursor-pointer rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--brand-surface-muted)] file:px-3 file:py-1 file:text-sm file:text-[var(--brand-text-main)]"
        />
        <Button variant="primary" onClick={() => void confronta()} disabled={!file} loading={busy}>
          <Scale size={16} aria-hidden="true" />
          Confronta
        </Button>
        {esito && (
          <Button
            variant="outline"
            onClick={() => void esporta()}
            title="Scarica il confronto in xlsx: le liste complete, un foglio per coda"
          >
            <Download size={16} aria-hidden="true" />
            Esporta
          </Button>
        )}
      </div>

      {esito && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile size="sm" label="Allineati" value={esito.allineati} tone="ok" />
            <StatTile
              size="sm"
              label="Manca il nostro esito"
              value={esito.daChiudereDaNoi.length}
              tone={esito.daChiudereDaNoi.length > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              size="sm"
              label="In lavorazione oggi"
              value={esito.inLavorazioneOggi}
              note="squadre ancora fuori: si chiudono col rapportino di stasera"
            />
            <StatTile
              size="sm"
              label="Da registrare sul sito"
              value={esito.mancantiSulSito.length}
              tone={esito.mancantiSulSito.length > 0 ? 'warn' : 'neutral'}
            />
            <StatTile size="sm" label="Non esitati dal sito" value={esito.nonEsitatiSito} />
            <StatTile
              size="sm"
              label="Sconosciuti al registro"
              value={esito.sconosciuti.length}
              tone={esito.sconosciuti.length > 0 ? 'warn' : 'neutral'}
            />
          </div>

          {esito.daChiudereDaNoi.length > 0 && (
            <Elenco titolo={`Il sito li dà per fatti, da noi sono ancora aperti (${esito.daChiudereDaNoi.length})`}>
              {esito.daChiudereDaNoi.slice(0, MAX_RIGHE).map((v) => (
                <li key={v.odl} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                  <span className="font-mono text-[var(--brand-text-main)]">{v.odl}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--brand-text-muted)]">
                    {[v.nominativo, v.comune].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-[var(--brand-text-muted)]">{v.esitoSito.toLowerCase()} · {v.dataSito} · da noi: {v.statoNostro}</span>
                </li>
              ))}
            </Elenco>
          )}

          {esito.mancantiSulSito.length > 0 && (
            <Elenco titolo={`Chiusi da noi, senza esito sul sito (${esito.mancantiSulSito.length})`}>
              {esito.mancantiSulSito.slice(0, MAX_RIGHE).map((v) => (
                <li key={v.odl} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                  <span className="font-mono text-[var(--brand-text-main)]">{v.odl}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--brand-text-muted)]">
                    {[v.nominativo, v.comune].filter(Boolean).join(' · ')}
                  </span>
                  <span className="text-[var(--brand-text-muted)]">chiusa il {v.chiusaIl ?? '—'}</span>
                </li>
              ))}
            </Elenco>
          )}

          {esito.impiantiDifformi.length > 0 && (
            <Elenco titolo={`Impianto diverso fra sito e registro (${esito.impiantiDifformi.length})`}>
              {esito.impiantiDifformi.slice(0, MAX_RIGHE).map((v) => (
                <li key={v.odl} className="flex flex-wrap items-baseline gap-x-3 py-1">
                  <span className="font-mono text-[var(--brand-text-main)]">{v.odl}</span>
                  <span className="text-[var(--brand-text-muted)]">
                    sito {v.impiantoSito} · registro {v.impiantoRegistro}
                  </span>
                </li>
              ))}
            </Elenco>
          )}

          {esito.sconosciuti.length > 0 && (
            <Elenco titolo={`ODL del file sconosciuti al registro (${esito.sconosciuti.length})`}>
              <li className="py-1 font-mono text-[var(--brand-text-muted)]">
                {esito.sconosciuti.slice(0, MAX_RIGHE).join(', ')}
                {esito.sconosciuti.length > MAX_RIGHE ? ', …' : ''}
              </li>
            </Elenco>
          )}
        </div>
      )}
    </Card>
  );
}

function Elenco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--brand-text-muted)]">{titolo}</h3>
      <ul className="mt-1 divide-y divide-[var(--brand-border)] text-xs">{children}</ul>
    </div>
  );
}
