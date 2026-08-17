// lib/acea/vociSpostamento.ts
// PURA: quali voci di rapportino restano indietro quando un intervento cambia operatore o giorno.
//
// IL BUCO CHE CHIUDE
// `pianoPianificazione` non duplica mai: un ODL con un intervento aperto viene SPOSTATO (azione
// `aggiorna`), perché «due interventi aperti sullo stesso ODL manderebbero due squadre allo
// stesso indirizzo». La regola è giusta e funziona — ma si ferma alla tabella `interventi`.
//
// Il rapportino, invece, non lo segue: `sincronizzaRapportiniAcea` dichiara di non cancellare
// mai una voce, di nessuna origine. Quindi dopo lo spostamento la voce resta sul rapportino di
// chi l'ODL non ce l'ha più, e una seconda nasce su quello del nuovo operatore. Nello storico
// l'esecutore è lo staff del rapportino PADRE, quindi lo stesso ODL compare sotto due nomi lo
// stesso giorno — la doppia assegnazione che l'invariante degli interventi credeva di aver
// impedito. Nessun indice la vede: l'unicità vive tutta su `interventi` (una riga, corretta), e
// `rapportino_voci` non ha nessun vincolo sull'ODL.
//
// Peggio dell'apparenza: le due voci puntano allo STESSO intervento, quindi i due operatori ne
// scrivono l'esito a turno e l'ultimo cancella il primo. Il 14/08/2026 sull'ODL 12384609
// LIBERATORI ha chiuso «SI» alle 13:18 e PRATESI «NO» alle 13:27: ha vinto il NO, su un lavoro
// che era stato fatto. Al 17/08/2026 le voci appese a un intervento di un altro operatore o di
// un altro giorno sono 28.
//
// LA REGOLA
// La voce lasciata indietro si toglie SOLO se è ancora vuota — cioè se l'operatore non ci ha
// lavorato. Una voce già compilata è il racconto di un'uscita vera (anche di un tentativo a
// vuoto) e non si cancella per una decisione di pianificazione presa dopo: si SEGNALA, e a
// deciderne è l'ufficio dal modulo interventi.
//
// Stessa prudenza sul rapportino già `inviato`: la giornata è chiusa e consegnata, e togliere
// una riga da un documento consegnato è una riscrittura, non una pulizia. Si segnala e basta —
// è la stessa ragione per cui il motore ACEA non riapre un inviato senza conferma dell'admin.

/** Una voce agganciata all'intervento che si sta spostando, con lo stato del suo rapportino. */
export type VoceDaSpostamento = {
  id: string;
  rapportino_id: string;
  /** Staff del rapportino PADRE: è l'esecutore che lo storico mostra. */
  staff_id: string;
  /** Data del rapportino PADRE. */
  data: string;
  /** Stato del rapportino padre: `inviato` è consegnato e non si riscrive. */
  stato: string | null;
  risposte: Record<string, unknown> | null;
};

/** Dove l'intervento è appena andato a finire. */
export type DestinazioneSpostamento = { staffId: string; data: string };

/** Perché una voce rimasta indietro non è stata tolta da sola. */
export type MotivoConservazione = 'compilata' | 'rapportino_inviato';

export type VoceConservata = {
  voce: VoceDaSpostamento;
  motivo: MotivoConservazione;
};

export type EsitoVociSpostamento = {
  /** Id delle voci vuote da eliminare: il lavoro non è mai iniziato lì. */
  daRimuovere: string[];
  /** Voci rimaste indietro che NON si toccano: l'ufficio deve saperlo. */
  daConservare: VoceConservata[];
};

/**
 * Una risposta che vale come «l'operatore ci ha messo mano».
 *
 * Non basta `risposte !== {}`: il salvataggio dal campo può lasciare chiavi con stringa vuota
 * (un campo aperto e richiuso senza scrivere), e trattarle come lavoro svolto bloccherebbe la
 * pulizia proprio nel caso normale. Un array o un oggetto vuoto — una lista foto senza foto —
 * conta come vuoto per la stessa ragione.
 */
function valorizzata(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/** `true` se nessuna risposta della voce è valorizzata. */
export function voceVuota(risposte: Record<string, unknown> | null | undefined): boolean {
  if (!risposte) return true;
  return !Object.values(risposte).some(valorizzata);
}

/**
 * Le voci rimaste sul rapportino sbagliato dopo lo spostamento dell'intervento.
 *
 * Una voce è «a posto» quando il suo rapportino padre ha lo staff E il giorno della
 * destinazione: quella è la voce che l'operatore nuovo deve trovarsi (o che
 * `sincronizzaRapportiniAcea` gli creerà). Tutte le altre sono residui dello spostamento.
 *
 * Idempotente: se non c'è niente da spostare le due liste sono vuote, e rieseguire dopo la
 * pulizia non trova più nulla.
 */
export function vociDaSpostamento(
  voci: readonly VoceDaSpostamento[],
  destinazione: DestinazioneSpostamento,
): EsitoVociSpostamento {
  const daRimuovere: string[] = [];
  const daConservare: VoceConservata[] = [];
  for (const v of voci) {
    if (v.staff_id === destinazione.staffId && v.data === destinazione.data) continue;
    if (!voceVuota(v.risposte)) {
      daConservare.push({ voce: v, motivo: 'compilata' });
      continue;
    }
    if (v.stato === 'inviato') {
      daConservare.push({ voce: v, motivo: 'rapportino_inviato' });
      continue;
    }
    daRimuovere.push(v.id);
  }
  return { daRimuovere, daConservare };
}

/**
 * L'avviso per l'ufficio sulle voci che lo spostamento non ha potuto togliere.
 *
 * Si dice, non si tace: una voce rimasta indietro diventa una riga dello storico sotto il nome
 * sbagliato, e chi ha appena spostato l'ODL è l'unico che in quel momento sa perché. `null`
 * quando non c'è niente da dire.
 */
export function avvisoVociConservate(conservate: readonly VoceConservata[]): string | null {
  if (conservate.length === 0) return null;
  const compilate = conservate.filter((c) => c.motivo === 'compilata').length;
  const inviate = conservate.length - compilate;
  const pezzi: string[] = [];
  if (compilate > 0) {
    pezzi.push(compilate === 1
      ? '1 già compilata dal precedente esecutore'
      : `${compilate} già compilate dai precedenti esecutori`);
  }
  if (inviate > 0) {
    pezzi.push(inviate === 1 ? '1 su un rapportino già inviato' : `${inviate} su rapportini già inviati`);
  }
  const quante = conservate.length === 1
    ? 'Una voce di rapportino resta'
    : `${conservate.length} voci di rapportino restano`;
  return `${quante} sull'esecutore precedente (${pezzi.join(', ')}): compaiono ancora nello storico sotto quel nome, vanno sistemate dal modulo interventi.`;
}
