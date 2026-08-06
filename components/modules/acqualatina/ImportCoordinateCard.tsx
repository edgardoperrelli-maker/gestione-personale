'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';

const ENDPOINT = '/api/acqualatina/coordinate';

type Esito = {
  letteDalFile: number;
  conCoordinate: number;
  senzaCoordinate: number;
  senzaAggancio: number;
  aggiornate: number;
  giaUguali: number;
  nonTrovate: number;
  error?: string;
};

/**
 * Le coordinate GPS del committente sul registro AcquaLatina.
 *
 * Riquadro a sé e non un secondo uso dell'import master, perché il file è un'altra cosa:
 * l'estrazione delle FORNITURE del comune, dove le coordinate ci sono su tutte le righe e
 * l'ordine quasi su nessuna (a Terracina 489 righe su 4.194). Il master pretende l'ODL — è la
 * sua identità — e di là quelle righe verrebbero buttate; qui l'aggancio è la fornitura, e il
 * file non crea mai un ordine: arricchisce quelli che il registro ha già.
 */
export default function ImportCoordinateCard() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  const invia = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as Esito;
      if (!res.ok) {
        toast.error(body.error ?? 'Import delle coordinate non riuscito.');
        return;
      }
      setEsito(body);
      toast.success(
        body.aggiornate > 0
          ? `${body.aggiornate} punti hanno ora le coordinate.`
          : 'Nessuna novità: il registro aveva già queste coordinate.',
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import delle coordinate non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [file]);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Coordinate dei punti</h2>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          Carica l&apos;estrazione del committente con LATITUDINE e LONGITUDINE: le coordinate si
          agganciano ai punti già a registro per COD_FORNITURA e, dove manca, per CODODL. Da lì
          scendono sul rapportino come <b>Punto esatto</b>, il link che apre Maps sul contatore
          invece che sull&apos;indirizzo. Nessun ordine nuovo entra da qui, e stati, pianificazione
          e anagrafica non si toccano.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idFile} className="sr-only">
          File con le coordinate AcquaLatina
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
          <Crosshair size={16} aria-hidden="true" />
          Importa coordinate
        </Button>
      </div>

      {esito && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              size="sm"
              label="Punti aggiornati"
              value={esito.aggiornate}
              tone={esito.aggiornate > 0 ? 'ok' : 'neutral'}
              note={esito.giaUguali > 0 ? `${esito.giaUguali} già uguali` : undefined}
            />
            <StatTile size="sm" label="Righe lette" value={esito.letteDalFile} note={`${esito.conCoordinate} con coordinate`} />
            {/* Non è un errore: il file copre l'INTERO comune, il registro solo la campagna in
                corso. Serve però a distinguere «file giusto, comune diverso» da «tutto a posto». */}
            <StatTile
              size="sm"
              label="Fuori registro"
              value={esito.nonTrovate}
              note="forniture non in campagna"
            />
            <StatTile
              size="sm"
              label="Senza coordinate"
              value={esito.senzaCoordinate + esito.senzaAggancio}
              tone={esito.senzaCoordinate + esito.senzaAggancio > 0 ? 'warn' : 'neutral'}
              note={esito.senzaAggancio > 0 ? `${esito.senzaAggancio} senza ODL né fornitura` : undefined}
            />
          </div>
          <p className="text-xs text-[var(--brand-text-muted)]">
            Perché l&apos;operatore le veda, il campo <b>COORDINATE</b> va acceso nel flusso
            AcquaLatina (Impostazioni → Azioni operatori), come gli altri campi anagrafici.
          </p>
        </div>
      )}
    </Card>
  );
}
