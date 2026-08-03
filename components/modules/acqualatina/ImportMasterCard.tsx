'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';

const ENDPOINT_MASTER = '/api/admin/interventi/template-master';
const ENDPOINT_SYNC = '/api/acqualatina/ordini/sync';
const COMMITTENTE = 'acqualatina';

type EsitoMaster = {
  ok?: boolean;
  id: string | null;
  righe: number;
  totale: number;
  scartate: number;
  giaPresenti: number;
  doppieNelFile: number;
  error?: string;
};

type EsitoSync = {
  inseriti: number;
  arricchiti: number;
  giaPresenti: number;
  scartate: number;
  error?: string;
};

type Master = {
  id: string;
  nome: string | null;
  file_nome: string | null;
  committente: string | null;
  attivo: boolean;
  righe_totali: number | null;
  created_at: string;
};

const dataOra = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/**
 * Caricamento del master AcquaLatina, dentro il modulo.
 *
 * Il file c'era già un posto dove caricarlo — Impostazioni → Template master — ed è lì che
 * continua a vivere: il master è una struttura di CASA, condivisa fra committenti, e il sync
 * degli ordini legge da lì. Quello che mancava era il GESTO: per aggiornare la commessa si
 * doveva uscire dal modulo, andare in un'area di sistema, scegliere il committente giusto in
 * una tendina, tornare indietro e premere «Aggiorna dal master». Tre schermate per una cosa
 * che in ACEA è un riquadro dentro Strumenti.
 *
 * Qui il gesto è uno: si carica il file e il registro è allineato. Sotto succedono le due cose
 * di sempre, in fila e raccontate — il master entra, poi gli ordini lo assorbono — perché a
 * caricare un file e non vedere cambiare il registro non si capisce quale dei due passi è
 * mancato.
 */
export default function ImportMasterCard({ onImportato }: { onImportato?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esitoMaster, setEsitoMaster] = useState<EsitoMaster | null>(null);
  const [esitoSync, setEsitoSync] = useState<EsitoSync | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  const caricaMasters = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT_MASTER);
      if (!res.ok) return;
      const body = (await res.json()) as { masters?: Master[] };
      setMasters((body.masters ?? []).filter((m) => m.committente === COMMITTENTE));
    } catch {
      /* l'elenco è contorno: se non arriva, il caricamento funziona lo stesso */
    }
  }, []);

  useEffect(() => { void caricaMasters(); }, [caricaMasters]);

  const invia = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setEsitoMaster(null);
    setEsitoSync(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('committente', COMMITTENTE);
      const res = await fetch(ENDPOINT_MASTER, { method: 'POST', body: fd });
      const master = (await res.json().catch(() => ({}))) as EsitoMaster;
      if (!res.ok) {
        toast.error(master.error ?? 'Caricamento del master non riuscito.');
        return;
      }
      setEsitoMaster(master);

      /*
        Il sync parte SEMPRE, anche quando il file non porta righe nuove: «già presenti» dice
        che il MASTER le ha, non che il registro le abbia assorbite. Saltarlo lì sarebbe
        esattamente il caso in cui si ricarica il file per rimediare a un sync mai fatto.
      */
      const resSync = await fetch(ENDPOINT_SYNC, { method: 'POST' });
      const sync = (await resSync.json().catch(() => ({}))) as EsitoSync;
      if (!resSync.ok) {
        toast.error(
          `Master caricato (${master.righe} righe), ma l'allineamento del registro è fallito: ${sync.error ?? 'errore dal server'}`,
        );
        return;
      }
      setEsitoSync(sync);

      toast.success(
        master.righe === 0 && sync.inseriti === 0
          ? 'Nessuna novità: master e registro erano già allineati.'
          : `Master caricato: ${master.righe} righe nuove, ${sync.inseriti} ordini a registro.`,
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await caricaMasters();
      onImportato?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import del master non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [file, caricaMasters, onImportato]);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Import master AcquaLatina</h2>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          Carica qui il file del committente senza modificarlo. Le righe già viste vengono saltate
          e gli ordini nuovi entrano subito nel registro: le righe già pianificate non si toccano,
          e niente esce mai dal registro perché è sparito dal file.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          `<label>` collegata e non solo un `aria-label`: senza nome accessibile un input file
          viene annunciato come «pulsante Scegli file» e basta. È nascosta alla vista perché il
          riquadro dice già cosa si carica.
        */}
        <label htmlFor={idFile} className="sr-only">
          File del master AcquaLatina
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
        <Button variant="primary" onClick={() => void invia()} disabled={!file} loading={busy}>
          <Upload size={16} aria-hidden="true" />
          Importa
        </Button>
      </div>

      {esitoMaster && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--brand-text-muted)]">Dal file al master</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile size="sm" label="Righe lette" value={esitoMaster.totale} />
            <StatTile size="sm" label="Nuove" value={esitoMaster.righe} tone={esitoMaster.righe > 0 ? 'ok' : 'neutral'} />
            <StatTile size="sm" label="Già presenti" value={esitoMaster.giaPresenti} />
            <StatTile
              size="sm"
              label="Scartate"
              value={esitoMaster.scartate + esitoMaster.doppieNelFile}
              tone={esitoMaster.scartate + esitoMaster.doppieNelFile > 0 ? 'warn' : 'neutral'}
              note={esitoMaster.doppieNelFile > 0 ? `${esitoMaster.doppieNelFile} doppie nel file` : undefined}
            />
          </div>
        </div>
      )}

      {esitoSync && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--brand-text-muted)]">Dal master al registro</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile size="sm" label="Ordini nuovi" value={esitoSync.inseriti} tone={esitoSync.inseriti > 0 ? 'ok' : 'neutral'} />
            <StatTile size="sm" label="Anagrafiche completate" value={esitoSync.arricchiti} />
            <StatTile size="sm" label="Già a registro" value={esitoSync.giaPresenti} />
            <StatTile
              size="sm"
              label="Righe scartate"
              value={esitoSync.scartate}
              tone={esitoSync.scartate > 0 ? 'warn' : 'neutral'}
            />
          </div>
        </div>
      )}

      {masters.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--brand-text-muted)]">Master caricati</h3>
          <ul className="mt-1 divide-y divide-[var(--brand-border)] text-xs">
            {masters.slice(0, 5).map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-[var(--brand-text-main)]">
                  {dataOra(m.created_at)}
                  {m.file_nome ? ` · ${m.file_nome}` : m.nome ? ` · ${m.nome}` : ''}
                  {!m.attivo && <span className="ml-1 text-[var(--brand-text-muted)]">(spento)</span>}
                </span>
                <span className="font-mono tabular-nums text-[var(--brand-text-muted)]">
                  {m.righe_totali ?? 0} righe
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
