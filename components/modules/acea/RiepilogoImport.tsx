'use client';

import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import StatTile from '@/components/ui/StatTile';

/** Avviso non bloccante emerso dal parsing di una riga. */
export type AvvisoImport = {
  odl: string;
  numero_operazione: string;
  tipo: string;
  dettaglio: string;
};

export type EsitoImport = {
  importId: string;
  finestra: { dal: string | null; al: string | null };
  righeFile: number;
  nuove: number;
  modificate: number;
  invariate: number;
  annullateRimosse: number;
  nonCoperte: number;
  annullatiPianificati: Array<{ odl: string; numero_operazione: string; data: string | null; operatore: string | null }>;
  avvisi: AvvisoImport[];
  archiviato: boolean;
};

const data = (iso: string | null) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/**
 * Esito di un import.
 *
 * È il sostituto del CONFRONTA fatto in Excel: dice cosa è arrivato oggi. Per questo non si
 * limita a un "importato ✓" — senza i conteggi nessuno saprebbe se il file era quello giusto.
 */
export default function RiepilogoImport({
  esito,
  interrotto = false,
}: {
  esito: EsitoImport;
  /**
   * L'import si è fermato a metà: le scritture già andate a segno RESTANO.
   *
   * Prima questo caso usciva come un solo toast «import non riuscito» e il riepilogo veniva
   * buttato via — mentre il registro era già stato modificato. Chi legge «non riuscito» ricarica
   * il file convinto che non sia successo niente, e non ha modo di sapere cosa c'è dentro.
   */
  interrotto?: boolean;
}) {
  const perTipo = esito.avvisi.reduce<Record<string, number>>((acc, a) => {
    acc[a.tipo] = (acc[a.tipo] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {interrotto ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--brand-text-main)]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--status-ko)]" aria-hidden="true" />
          <span>
            <strong>Import interrotto.</strong> Le scritture qui sotto sono già state applicate al
            registro: quello che manca è il resto del file. Ricaricare lo stesso file è sicuro — le
            righe già scritte risultano invariate.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
          <CheckCircle2 size={18} className="text-[var(--status-ok)]" aria-hidden="true" />
          <span>
            Import completato — il file copre dal <strong>{data(esito.finestra.dal)}</strong> al{' '}
            <strong>{data(esito.finestra.al)}</strong>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Righe nel file" value={esito.righeFile} />
        <StatTile label="Nuove" value={esito.nuove} tone={esito.nuove > 0 ? 'primary' : 'neutral'} />
        <StatTile label="Modificate" value={esito.modificate} />
        <StatTile label="Invariate" value={esito.invariate} note="nessuna scrittura" />
        <StatTile
          label="Annullate rimosse"
          value={esito.annullateRimosse}
          tone={esito.annullateRimosse > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Non coperte"
          value={esito.nonCoperte}
          note="in registro, fuori dal file"
          tone={esito.nonCoperte > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {esito.annullatiPianificati.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
            <AlertTriangle size={16} aria-hidden="true" />
            {esito.annullatiPianificati.length} ordini annullati da ACEA erano pianificati
          </div>
          <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
            Vanno tolti dal giro degli operatori: ACEA li ha annullati dopo che erano stati assegnati.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {esito.annullatiPianificati.slice(0, 20).map((a) => (
              <li key={`${a.odl}-${a.numero_operazione}`} className="font-mono tabular-nums">
                {a.odl}/{a.numero_operazione} — {data(a.data)}
                {a.operatore ? ` · ${a.operatore}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Token di stato e non di superficie: il grigio neutro faceva leggere l'avviso come una nota
          di contorno, col colore relegato all'icona. Stessa grammatica degli altri due avvisi del
          modulo (RapportiniGiorno, Saracinesche). */}
      {esito.avvisi.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-text-main)]">
            <FileWarning size={16} className="text-[var(--warning)]" aria-hidden="true" />
            {esito.avvisi.length} righe da controllare
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-[var(--brand-text-muted)]">
            {Object.entries(perTipo).map(([tipo, n]) => (
              <li key={tipo}>
                <span className="font-mono tabular-nums">{n}</span>{' '}
                {tipo === 'misuratore_assente' && 'senza impianto né matricola (atteso sulle rimozioni abusive)'}
                {tipo === 'sospetto_troncamento' && 'con la matricola al limite dei 40 caratteri del campo ACEA'}
                {tipo === 'tipo_ordine_ignoto' && 'con un tipo di ordine non riconosciuto: entrate come dunning'}
                {tipo === 'stato_ignoto' && 'con uno stato mai visto: entrate come aperte, da controllare'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!esito.archiviato && (
        <p className="text-xs text-[var(--brand-text-muted)]">
          Nota: il file non è stato archiviato in cassaforte (l&apos;import è comunque valido).
        </p>
      )}
    </div>
  );
}
