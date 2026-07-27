import { describe, it, expect } from 'vitest';
import { famigliaDaTipoOrdine } from './famiglia';
import { isAperto, isAnnullato, isCompletato, normalizzaStato, STATI_APERTI } from './statiOrdine';
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
    expect(isAperto('sconosciuto')).toBe(false);
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
