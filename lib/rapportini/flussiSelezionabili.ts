// PURA: i flussi di Azioni operatori che possono fare da modello a un piano, nella forma
// che serve al selettore della mappa.
//
// Rispecchia ESATTAMENTE la regola del server (`candidati` in sincronizzaRapportini):
// attivi, non `solo_manuale`, ordinati per nome con collation italiana. Se il selettore
// offrisse più o meno di così, l'ufficio potrebbe scegliere un flusso che la generazione
// rifiuta — o non potrebbe scegliere uno che accetterebbe.
//
// Nota: `riservato_pi` NON si esclude, perché il server non lo esclude. La riserva vale per
// il pool del "+" (`caricaTemplateManuali`), non per il modello di un piano.

export type FlussoRow = {
  id: string;
  nome: string | null;
  active?: boolean | null;
  solo_manuale?: boolean | null;
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
};

export type FlussoOpzione = {
  id: string;
  /** Etichetta per la tendina: nome + committente e gruppi coperti, quando dichiarati. */
  etichetta: string;
  /** Serve a spiegare in UI cosa scaricherà il dispositivo dell'operatore. */
  gruppoCommittente: string | null;
};

const t = (v: unknown): string => String(v ?? '').trim();

/** «ITALGAS» → «Italgas»: i codici committente in DB sono minuscoli, in UI si mostrano
 *  con l'iniziale maiuscola. AcquaLatina ha una grafia sua. */
function etichettaCommittente(codice: string): string {
  if (codice === 'acqualatina') return 'AcquaLatina';
  return codice.charAt(0).toUpperCase() + codice.slice(1);
}

export function flussiSelezionabili(rows: FlussoRow[]): FlussoOpzione[] {
  return (rows ?? [])
    .filter((r) => r.active !== false && !r.solo_manuale && t(r.id) !== '')
    .map((r) => {
      const nome = t(r.nome) || '(senza nome)';
      const committente = t(r.gruppo_committente).toLowerCase();
      const gruppi = (r.gruppi_attivita ?? []).map(t).filter(Boolean);
      // Il CHECK in DB tiene committente e gruppi valorizzati insieme: se c'è l'uno c'è
      // l'altro, e la coda dell'etichetta si costruisce o tutta o niente.
      const coda = committente ? ` · ${etichettaCommittente(committente)} · ${gruppi.join(', ')}` : '';
      return { id: r.id, etichetta: `${nome}${coda}`, gruppoCommittente: committente || null };
    })
    .sort((a, b) => a.etichetta.localeCompare(b.etichetta, 'it', { sensitivity: 'base' }));
}
