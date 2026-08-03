'use client';

import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import StatTile from '@/components/ui/StatTile';

/** Avviso non bloccante emerso dal parsing di una riga. */
export type AvvisoImport = {
  odl: string;
  numero_operazione: string;
  tipo: string;
  dettaglio: string;
  /** Quale dei due registri contiene la riga: senza, il link non saprebbe dove mandare. */
  famiglia: 'dunning' | 'massive';
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
  /**
   * Interventi riportati a positivo perché il Cruscotto li dà per contabilizzati.
   * Opzionale: un riepilogo salvato prima del 2026-08-03 non ce l'ha.
   */
  esitiCorretti?: number;
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
  // Raggruppate per tipo tenendo le RIGHE, non il solo conteggio: e` la differenza fra un numero
  // che si legge e un elenco su cui si puo` lavorare.
  const perTipo = esito.avvisi.reduce<Record<string, AvvisoImport[]>>((acc, a) => {
    (acc[a.tipo] ??= []).push(a);
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
        {/*
          Le correzioni d'esito si DICONO. Sono l'unica cosa che l'import scrive sopra a un
          dato compilato da un operatore: contarle senza mostrarle sarebbe la magia che fa
          perdere fiducia nel registro. Tono `primary` e non `warn` — è lavoro recuperato,
          non un problema.
        */}
        <StatTile
          label="Esiti corretti"
          value={esito.esitiCorretti ?? 0}
          note="ACEA li ha pagati"
          tone={(esito.esitiCorretti ?? 0) > 0 ? 'primary' : 'neutral'}
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
          {/*
            Ogni tipo si APRE sui suoi ODL, e ogni ODL e` un link al registro che lo contiene.

            Prima il riquadro contava e basta: «6 con uno stato mai visto» senza dire quali, e senza
            un modo di raggiungerle. Un numero cosi` si legge, si annuisce e si dimentica — e le
            righe da controllare restano lì. Gli ODL c'erano gia` tutti negli avvisi: mancava solo
            di mostrarli.

            `<details>` e non uno stato React: e` chiusura e apertura native, funzionano da tastiera
            e con i lettori di schermo senza che ci sia niente da tenere in piedi.
          */}
          <ul className="mt-2 space-y-1 text-xs text-[var(--brand-text-muted)]">
            {Object.entries(perTipo).map(([tipo, righe]) => (
              <li key={tipo}>
                <details>
                  <summary className="cursor-pointer rounded-[var(--radius-sm)] marker:text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                    <span className="font-mono tabular-nums">{righe.length}</span>{' '}
                    {tipo === 'misuratore_assente' && 'senza impianto né matricola (atteso sulle rimozioni abusive)'}
                    {tipo === 'sospetto_troncamento' && 'con la matricola al limite dei 40 caratteri del campo ACEA'}
                    {tipo === 'tipo_ordine_ignoto' && 'con un tipo di ordine non riconosciuto: entrate come dunning'}
                    {tipo === 'stato_ignoto' && 'con uno stato mai visto: entrate come aperte, da controllare'}
                  </summary>
                  <ul className="ml-4 mt-1 space-y-0.5">
                    {righe.map((a) => (
                      <li key={`${a.odl}|${a.numero_operazione}`}>
                        {/*
                          La ricerca libera del registro cerca anche per ODL: portarci l'utente con
                          la riga gia` isolata gli risparmia di copiare il numero e incollarlo.
                        */}
                        <a
                          href={`/hub/acea/${a.famiglia}?cerca=${encodeURIComponent(a.odl)}`}
                          className="font-mono tabular-nums text-[var(--brand-primary)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                          title={a.dettaglio}
                        >
                          {a.odl}
                        </a>
                        <span className="ml-2 text-[var(--brand-text-muted)]">{a.dettaglio}</span>
                      </li>
                    ))}
                  </ul>
                </details>
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
