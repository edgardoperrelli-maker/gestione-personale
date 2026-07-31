import { describe, it, expect } from 'vitest';
import { ATTIVITA_TABELLONE, famigliaDaTipoOrdine } from './famiglia';
import {
  isAperto, isApertoNoto, isAnnullato, isCompletato, isStatoNoto, normalizzaStato, STATI_APERTI,
} from './statiOrdine';
import { scadenzaOrdine, giorniResidui } from './scadenza';

describe('famigliaDaTipoOrdine', () => {
  it('ASTR è la famiglia massive', () => {
    // Manutenzione Straordinaria: Limitazione Massiva su Impianto + Sostituzione saracinesca
    expect(famigliaDaTipoOrdine('ASTR')).toEqual({ famiglia: 'massive', riconosciuto: true });
  });

  it('ALIM, AMOR, ARMO e AVUF sono dunning', () => {
    // AVUF (Verifiche da Ufficio) è dunning: sono verifiche di manomissione sigilli da fare
    // in campo, e si consuntivano regolarmente.
    for (const t of ['ALIM', 'AMOR', 'ARMO', 'AVUF']) {
      expect(famigliaDaTipoOrdine(t)).toEqual({ famiglia: 'dunning', riconosciuto: true });
    }
  });

  it('normalizza spazi e minuscole', () => {
    expect(famigliaDaTipoOrdine('  astr ').famiglia).toBe('massive');
  });

  it('un tipo ignoto NON scarta la riga: dunning con flag di avviso', () => {
    // Mai perdere una riga per un codice nuovo: entra nel registro e viene segnalata.
    expect(famigliaDaTipoOrdine('AXXX')).toEqual({ famiglia: 'dunning', riconosciuto: false });
    expect(famigliaDaTipoOrdine('')).toEqual({ famiglia: 'dunning', riconosciuto: false });
    expect(famigliaDaTipoOrdine(null)).toEqual({ famiglia: 'dunning', riconosciuto: false });
  });
});

describe('ATTIVITA_TABELLONE', () => {
  it('i frammenti agganciano i nomi VERI delle attività di produzione', () => {
    // «DUNNING» e «LIMITAZIONI MASSIVE» sono i nomi in tabellone, verificati in produzione:
    // se un frammento smette di agganciare il suo nome, il menu degli assegnabili si svuota.
    const aggancia = (frammenti: string[], nome: string) =>
      frammenti.some((f) => nome.toUpperCase().includes(f));
    expect(aggancia(ATTIVITA_TABELLONE.dunning.frammenti, 'DUNNING')).toBe(true);
    expect(aggancia(ATTIVITA_TABELLONE.massive.frammenti, 'LIMITAZIONI MASSIVE')).toBe(true);
    // «CONTATORI» è l'attività con cui la squadra AcquaLatina sta in tabellone (territorio
    // ACQUA LATINA, righe reali dal 29/07 — verificato in produzione).
    expect(aggancia(ATTIVITA_TABELLONE.acqualatina.frammenti, 'CONTATORI')).toBe(true);
    // E non si agganciano a vicenda: le viste hanno squadre diverse.
    expect(aggancia(ATTIVITA_TABELLONE.dunning.frammenti, 'LIMITAZIONI MASSIVE')).toBe(false);
    expect(aggancia(ATTIVITA_TABELLONE.massive.frammenti, 'DUNNING')).toBe(false);
    expect(aggancia(ATTIVITA_TABELLONE.acqualatina.frammenti, 'DUNNING')).toBe(false);
    expect(aggancia(ATTIVITA_TABELLONE.dunning.frammenti, 'CONTATORI')).toBe(false);
    expect(aggancia(ATTIVITA_TABELLONE.massive.frammenti, 'CONTATORI')).toBe(false);
  });

  it('le etichette dicono il nome per intero: finiscono nei messaggi', () => {
    expect(ATTIVITA_TABELLONE.dunning.etichetta).toBe('DUNNING');
    expect(ATTIVITA_TABELLONE.massive.etichetta).toBe('LIMITAZIONI MASSIVE');
    expect(ATTIVITA_TABELLONE.acqualatina.etichetta).toBe('CONTATORI');
  });
});

describe('statiOrdine', () => {
  it('gli stati aperti sono pianificabili, SOSP incluso', () => {
    // Decisione 11: i SOSP si pianificano come interventi normali.
    expect(STATI_APERTI).toEqual(['DAPI', 'RICE', 'ASGN', 'SOSP']);
    for (const s of STATI_APERTI) expect(isAperto(s)).toBe(true);
  });

  it('COMP e ANNL non sono aperti', () => {
    expect(isAperto('COMP')).toBe(false);
    expect(isAperto('ANNL')).toBe(false);
  });

  it('riconosce completato e annullato', () => {
    expect(isCompletato('COMP')).toBe(true);
    expect(isAnnullato('ANNL')).toBe(true);
    expect(isAnnullato('COMP')).toBe(false);
  });

  it('normalizza e regge valori sporchi', () => {
    expect(normalizzaStato('  comp ')).toBe('COMP');
    expect(normalizzaStato(null)).toBe('');
    expect(isAperto('  dapi  ')).toBe(true);
  });

  it('uno stato MAI VISTO entra come aperto, non sparisce', () => {
    // Il 27/07/2026 il Cruscotto mostrava 4 ordini «Iniziato», stato assente dall'export del 26/07.
    // Trattarlo come chiuso li avrebbe fatti sparire dal backlog senza un segnale.
    expect(isAperto('INIZ')).toBe(true);
    expect(isAperto('QUALUNQUE')).toBe(true);
    // Ma resta riconoscibile come nuovo, così l'import lo segnala.
    expect(isStatoNoto('INIZ')).toBe(false);
    expect(isApertoNoto('INIZ')).toBe(false);
    for (const s of STATI_APERTI) {
      expect(isStatoNoto(s)).toBe(true);
      expect(isApertoNoto(s)).toBe(true);
    }
    expect(isStatoNoto('COMP')).toBe(true);
    expect(isStatoNoto('ANNL')).toBe(true);
  });

  it('uno stato assente non è aperto: è una riga malformata', () => {
    expect(isAperto('')).toBe(false);
    expect(isAperto(null)).toBe(false);
    expect(isAperto('   ')).toBe(false);
  });
});

describe('scadenzaOrdine', () => {
  it('le limitazioni massive NON scadono mai', () => {
    // Decisione 19: anche quando una data è presente, questi ordini non hanno scadenza per noi
    // (l'SLA ACEA è 157 giorni mediani: non governa il lavoro).
    expect(scadenzaOrdine({ famiglia: 'massive', codiceSla: 'NSLA', dataCreazione: '2026-07-01' })).toBeNull();
    expect(scadenzaOrdine({ famiglia: 'massive', codiceSla: 'RIAT', dataCreazione: '2026-07-01' })).toBeNull();
  });

  it('le attivazioni RIAT e REVO scadono il giorno dopo', () => {
    // Regola contrattuale ACEA: cardine a 1 giorno, verificato sull'export.
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'RIAT', dataCreazione: '2026-07-01' })).toBe('2026-07-02');
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'REVO', dataCreazione: '2026-07-01' })).toBe('2026-07-02');
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'revo', dataCreazione: '2026-07-01' })).toBe('2026-07-02');
  });

  it('il resto del dunning scade a 14 giorni', () => {
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'NSLA', dataCreazione: '2026-07-01' })).toBe('2026-07-15');
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: null, dataCreazione: '2026-07-01' })).toBe('2026-07-15');
  });

  it('attraversa i confini di mese e anno', () => {
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'NSLA', dataCreazione: '2026-12-25' })).toBe('2027-01-08');
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'RIAT', dataCreazione: '2026-02-28' })).toBe('2026-03-01');
  });

  it('data mancante o malformata → nessuna scadenza, nessuna eccezione', () => {
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'NSLA', dataCreazione: null })).toBeNull();
    expect(scadenzaOrdine({ famiglia: 'dunning', codiceSla: 'NSLA', dataCreazione: '01/07/2026' })).toBeNull();
  });
});

describe('giorniResidui', () => {
  it('positivi prima della scadenza, zero il giorno stesso, negativi dopo', () => {
    expect(giorniResidui('2026-07-15', '2026-07-10')).toBe(5);
    expect(giorniResidui('2026-07-15', '2026-07-15')).toBe(0);
    expect(giorniResidui('2026-07-15', '2026-07-20')).toBe(-5);
  });

  it('senza scadenza (massive) ritorna null', () => {
    expect(giorniResidui(null, '2026-07-10')).toBeNull();
  });

  it('non risente del fuso orario', () => {
    // Aritmetica in UTC: un ordine creato d'estate non deve slittare di un giorno per l'ora legale.
    expect(giorniResidui('2026-03-29', '2026-03-28')).toBe(1);
    expect(giorniResidui('2026-10-25', '2026-10-24')).toBe(1);
  });
});
