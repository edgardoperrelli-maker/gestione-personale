'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';
import { LIMITE_RIGHE_FOGLIO, parseCoordinateFile } from '@/lib/acqualatina/coordinateDaFile';

const ENDPOINT = '/api/acqualatina/coordinate';

type Esito = {
  letteDalFile: number;
  conCoordinate: number;
  senzaCoordinate: number;
  senzaAggancio: number;
  aggiornate: number;
  giaUguali: number;
  nonTrovate: number;
  /** Voci dei rapportini in corso di OGGI che hanno ricevuto la coordinata subito. */
  vociAggiornate: number;
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
 *
 * IL FOGLIO SI LEGGE QUI, nel browser, e al server vanno solo le coordinate.
 *
 * Non è un vezzo: il file del committente pesa 19 MB — dichiara 835.771 righe per 4.195 di dati,
 * il resto sono righe fantasma — e una funzione serverless rifiuta i body sopra ~4,5 MB prima
 * ancora di svegliarsi. Il 06/08 l'import rispondeva 413 senza lasciare una riga di log, perché
 * la richiesta non arrivava. Le coordinate utili sono 300 KB: si mandano quelle. Il parsing è la
 * stessa funzione pura del server (`parseCoordinateFile`), solo eseguita da questa parte del filo,
 * e il server ricontrolla ogni coordinata prima di scriverla.
 */
export default function ImportCoordinateCard() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [fase, setFase] = useState<'lettura' | 'invio' | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  const invia = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      setFase('lettura');
      const XLSX = await import('xlsx');
      /*
        `sheetRows` e `dense` sono la differenza fra quattro secondi e quaranta: senza il tetto
        SheetJS percorre l'intervallo DICHIARATO dal foglio (835.771 righe × 42 colonne = 35
        milioni di celle) invece delle 4.195 che hanno un valore. Il tetto non tronca mai in
        silenzio: se i dati ci arrivassero davvero, `parseCoordinateFile` si ferma e lo dice.
      */
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: 'array', sheetRows: LIMITE_RIGHE_FOGLIO, dense: true,
      });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { toast.error('File vuoto o privo di fogli.'); return; }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1, defval: '', raw: false, blankrows: false,
      });
      const parsed = parseCoordinateFile(rows);
      if (parsed.righe.length === 0) {
        toast.error('Nessuna riga con coordinate valide e un aggancio (CODODL o COD_FORNITURA).');
        return;
      }

      setFase('invio');
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ righe: parsed.righe }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<Esito>;
      if (!res.ok) {
        toast.error(body.error ?? 'Import delle coordinate non riuscito.');
        return;
      }
      setEsito({
        // I conteggi del FILE li sa solo chi l'ha letto, cioè questa pagina.
        letteDalFile: parsed.totale,
        conCoordinate: parsed.righe.length,
        senzaCoordinate: parsed.senzaCoordinate,
        senzaAggancio: parsed.senzaAggancio,
        aggiornate: body.aggiornate ?? 0,
        giaUguali: body.giaUguali ?? 0,
        nonTrovate: body.nonTrovate ?? 0,
        vociAggiornate: body.vociAggiornate ?? 0,
      });
      toast.success(
        (body.aggiornate ?? 0) > 0
          ? `${body.aggiornate} punti hanno ora le coordinate.`
          : 'Nessuna novità: il registro aveva già queste coordinate.',
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      // Qui finiscono anche i rifiuti del parser («non è l'estrazione con le coordinate», il
      // tetto delle righe): sono messaggi scritti per chi carica, si mostrano com'è.
      toast.error(e instanceof Error ? e.message : 'Import delle coordinate non riuscito.');
    } finally {
      setBusy(false);
      setFase(null);
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
        {/* Il file del committente è grosso e la lettura dura qualche secondo: senza una parola
            sembra bloccato, e si ricarica sopra. */}
        {fase && (
          <span className="text-xs text-[var(--brand-text-muted)]" role="status">
            {fase === 'lettura' ? 'Leggo il file…' : 'Aggiorno il registro…'}
          </span>
        )}
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
          {/* Il numero che dice se la giornata IN CORSO ne ha beneficiato: senza, l'import
              sembrerebbe servire solo da domani. */}
          <p className="text-xs text-[var(--brand-text-muted)]">
            {esito.vociAggiornate > 0
              ? <><b>{esito.vociAggiornate} voci</b> dei rapportini aperti oggi hanno già il «Punto esatto»: gli operatori lo vedono ricaricando la pagina. </>
              : 'Nessun rapportino in corso oggi aveva punti di questo file. '}
            Perché l&apos;operatore lo veda, va spuntato <b>«Mostra il link Punto esatto
            (coordinate)»</b> nel flusso AcquaLatina — Impostazioni → Azioni operatori →
            Sostituzione misuratori, in fondo ai dettagli della card.
          </p>
        </div>
      )}
    </Card>
  );
}
