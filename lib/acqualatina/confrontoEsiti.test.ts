import { describe, expect, it } from 'vitest';
import {
  classificaEsitoSito, confrontaEsitiSito, parseEsecuzioni,
  type RigaEsecuzione, type RigaRegistroPerConfronto,
} from './confrontoEsiti';

// Dati INVENTATI: il repo è pubblico, e qui non entrano ODL, impianti o nominativi reali.

const esec = (over: Partial<RigaEsecuzione> = {}): RigaEsecuzione => ({
  odl: '100001', impianto: '20000001', esito: 'EFFETTUATO NO ANOMALIE', dataFine: '29/07/2026 14:02',
  ...over,
});

const registro = (over: Partial<RigaRegistroPerConfronto> = {}): RigaRegistroPerConfronto => ({
  odl: '100001', aperto: false, esito_positivo: true, stato_desc: 'Chiusa — eseguita',
  data_completamento: '2026-07-29', impianto: '20000001', nominativo: 'ROSSI MARIO',
  comune: 'TERRACINA', ...over,
});

describe('parseEsecuzioni', () => {
  const HEADER = ['Codice Odl', "Codice Esterno dell'OdL", 'Codice Cliente', 'Esito', 'Data fine Esecuzione'];

  it('risolve le colonne per nome e riduce a una riga per ODL (vince quella CON esito)', () => {
    const { righe, totale } = parseEsecuzioni([
      HEADER,
      ['SCL1', '100001', '20000001', '', ''],
      ['SCL1', '100001', '20000001', 'EFFETTUATO NO ANOMALIE', '29/07/2026 14:02'],
      ['SCL2', '100002', '20000002', 'EFFETTUATO - CONTATORE GUASTO', '29/07/2026 15:00'],
    ]);
    expect(totale).toBe(3);
    expect(righe).toEqual([
      { odl: '100001', impianto: '20000001', esito: 'EFFETTUATO NO ANOMALIE', dataFine: '29/07/2026 14:02' },
      { odl: '100002', impianto: '20000002', esito: 'EFFETTUATO - CONTATORE GUASTO', dataFine: '29/07/2026 15:00' },
    ]);
  });

  it('le righe doppie della stessa esecuzione (una per componente della squadra) non contano due volte', () => {
    const { righe } = parseEsecuzioni([
      HEADER,
      ['SCL1', '100001', '20000001', 'EFFETTUATO NO ANOMALIE', '29/07/2026 14:02'],
      ['SCL1', '100001', '20000001', 'EFFETTUATO NO ANOMALIE', '29/07/2026 14:02'],
    ]);
    expect(righe).toHaveLength(1);
  });

  it('senza le colonne chiave lancia', () => {
    expect(() => parseEsecuzioni([['Codice Odl', 'Cliente'], ['SCL1', 'X']])).toThrow(/Codice Esterno/);
  });
});

describe('classificaEsitoSito', () => {
  // Il vocabolario COMPLETO visto nell'export reale del 13/08/2026 (845 righe): sei etichette,
  // di cui quattro sono uscite a vuoto. Il motore ne leggeva due e dava per fatte le altre.
  it.each([
    ['EFFETTUATO NO ANOMALIE', 'positivo'],
    ['EFFETTUATO - CONTATORE GUASTO', 'positivo'],
    ['NON ESEGUITO - VALVOLA CHIUSURA NN FUNZ', 'negativo'],
    ['NON ESEGUITO - NICCHIA CONT. NN ADEGUATA', 'negativo'],
    ['NON ESEGUITO - DIAMETRO NN DISPONIBILE', 'negativo'],
    ['NON ESEGUITO UTENTE ASSENTE', 'negativo'],
    ['', 'assente'],
    ['   ', 'assente'],
  ])('«%s» → %s', (esito, atteso) => {
    expect(classificaEsitoSito(esito)).toBe(atteso);
  });

  it('un\'etichetta nuova che non si dichiara «non eseguito» è un\'esecuzione', () => {
    // Il committente allunga l'elenco senza dirlo: il default deve stare dalla parte del
    // vocabolario dichiarato, non delle sigle.
    expect(classificaEsitoSito('EFFETTUATO - CONTATORE SOSTITUITO')).toBe('positivo');
    expect(classificaEsitoSito('non eseguito – motivo nuovo')).toBe('negativo');
  });
});

describe('confrontaEsitiSito', () => {
  it('sito effettuato + registro chiuso positivo = allineati', () => {
    const out = confrontaEsitiSito([esec()], [registro()]);
    expect(out.allineati).toBe(1);
    expect(out.daChiudereDaNoi).toEqual([]);
    expect(out.mancantiSulSito).toEqual([]);
  });

  it('sito effettuato ma registro ancora aperto: è la coda «manca il nostro esito»', () => {
    const out = confrontaEsitiSito(
      [esec()],
      [registro({ aperto: true, esito_positivo: null, stato_desc: 'Aperta' })],
    );
    expect(out.allineati).toBe(0);
    expect(out.daChiudereDaNoi).toEqual([{
      odl: '100001', esitoSito: 'EFFETTUATO NO ANOMALIE', dataSito: '29/07/2026 14:02',
      nominativo: 'ROSSI MARIO', comune: 'TERRACINA', statoNostro: 'aperta',
    }]);
  });

  it('«eseguito è sempre positivo»: anche CONTATORE GUASTO conta come effettuato', () => {
    const out = confrontaEsitiSito(
      [esec({ esito: 'EFFETTUATO - CONTATORE GUASTO' })],
      [registro({ aperto: true, esito_positivo: null })],
    );
    expect(out.daChiudereDaNoi).toHaveLength(1);
  });

  /*
    Il gruppo che mancava: il file porta anche i «NON ESEGUITO - …», e sono ESITI, non celle
    vuote. Trattarli come lavoro fatto accusava «manca il nostro esito» sulle righe in cui le
    due mani erano d'accordo — 13 su 18 anomalie del report del 13/08/2026, cioè tutte e sole
    le «non eseguito» del file.
  */
  describe('il sito dice NON ESEGUITO', () => {
    const NON_ESEG = 'NON ESEGUITO - VALVOLA CHIUSURA NN FUNZ';

    it('e da noi è «chiusa — non eseguita»: sono allineati, non un\'anomalia', () => {
      const out = confrontaEsitiSito(
        [esec({ esito: NON_ESEG })],
        [registro({ aperto: false, esito_positivo: false, stato_desc: 'Chiusa — non eseguita' })],
      );
      expect(out.allineati).toBe(1);
      expect(out.daChiudereDaNoi).toEqual([]);
      expect(out.mancantiSulSito).toEqual([]);
    });

    it('e da noi è «aperta — non eseguita» (da ripassare): allineati lo stesso', () => {
      // Due code diverse per noi, la stessa frase detta al sito: ci siamo andati, non si è fatto.
      const out = confrontaEsitiSito(
        [esec({ esito: NON_ESEG })],
        [registro({ aperto: true, esito_positivo: false, stato_desc: 'Aperta — non eseguita' })],
      );
      expect(out.allineati).toBe(1);
      expect(out.daChiudereDaNoi).toEqual([]);
    });

    it('e da noi non c\'è ancora nessun esito: manca il nostro rapportino', () => {
      const out = confrontaEsitiSito(
        [esec({ esito: NON_ESEG })],
        [registro({ aperto: true, esito_positivo: null, stato_desc: 'Aperta' })],
      );
      expect(out.daChiudereDaNoi).toHaveLength(1);
      expect(out.daChiudereDaNoi[0]?.esitoSito).toBe(NON_ESEG);
    });

    it('ma da noi è chiusa ESEGUITA: è il sito a essere indietro, e sta in UNA sola coda', () => {
      const out = confrontaEsitiSito([esec({ esito: NON_ESEG })], [registro()]);
      expect(out.daChiudereDaNoi).toEqual([]);
      expect(out.mancantiSulSito.map((m) => m.odl)).toEqual(['100001']);
      expect(out.allineati).toBe(0);
    });
  });

  it('il sito dice effettuato ma il nostro esito è «non eseguita»: i due si contraddicono', () => {
    // Non è «da registrare sul sito» né un allineamento: una delle due mani ha sbagliato, e
    // la riga va guardata. Resta nella coda dell'ufficio, col nostro stato accanto.
    const out = confrontaEsitiSito(
      [esec()],
      [registro({ aperto: false, esito_positivo: false, stato_desc: 'Chiusa — non eseguita' })],
    );
    expect(out.daChiudereDaNoi).toEqual([{
      odl: '100001', esitoSito: 'EFFETTUATO NO ANOMALIE', dataSito: '29/07/2026 14:02',
      nominativo: 'ROSSI MARIO', comune: 'TERRACINA', statoNostro: 'chiusa — non eseguita',
    }]);
  });

  it('chiuso positivo da noi ma sito senza esito (o senza l\'ODL): coda «da registrare sul sito»', () => {
    const out = confrontaEsitiSito(
      [esec({ odl: '100001', esito: '' })],
      [registro({ odl: '100001' }), registro({ odl: '100002' })],
    );
    expect(out.nonEsitatiSito).toBe(1);
    expect(out.mancantiSulSito.map((m) => m.odl).sort()).toEqual(['100001', '100002']);
  });

  it('le righe aperte da noi e non esitate dal sito non sono in nessuna coda', () => {
    const out = confrontaEsitiSito(
      [esec({ esito: '' })],
      [registro({ aperto: true, esito_positivo: null })],
    );
    expect(out.allineati + out.daChiudereDaNoi.length + out.mancantiSulSito.length).toBe(0);
    expect(out.nonEsitatiSito).toBe(1);
  });

  it('un ODL in lavorazione oggi non finisce in nessuna coda: si conta e basta', () => {
    // La squadra registra live sul sito, il nostro rapportino arriva a fine giornata:
    // accusarlo come «manca il nostro esito» mentre gli operatori lavorano crea confusione.
    const out = confrontaEsitiSito(
      [esec()],
      [registro({ aperto: true, esito_positivo: null })],
      new Set(['100001']),
    );
    expect(out.daChiudereDaNoi).toEqual([]);
    expect(out.inLavorazioneOggi).toBe(1);
    // Già chiusa da noi = allineato, anche se una nuova uscita è in corso.
    const chiuso = confrontaEsitiSito([esec()], [registro()], new Set(['100001']));
    expect(chiuso.allineati).toBe(1);
    expect(chiuso.inLavorazioneOggi).toBe(0);
  });

  it('una chiusura di OGGI non è ancora «mancante sul sito»: la giornata non è finita', () => {
    const out = confrontaEsitiSito(
      [],
      [registro({ data_completamento: '2026-08-04' }), registro({ odl: '100002', data_completamento: '2026-08-03' })],
      new Set(),
      '2026-08-04',
    );
    expect(out.mancantiSulSito.map((m) => m.odl)).toEqual(['100002']);
    expect(out.chiusiOggi).toBe(1);
  });

  it("l'ODL del file che il registro non conosce finisce fra gli sconosciuti", () => {
    const out = confrontaEsitiSito([esec({ odl: '999999' })], [registro()]);
    expect(out.sconosciuti).toEqual(['999999']);
  });

  it('il Codice Cliente diverso dal nostro impianto è un allarme di identità', () => {
    const out = confrontaEsitiSito([esec({ impianto: '20009999' })], [registro()]);
    expect(out.impiantiDifformi).toEqual([
      { odl: '100001', impiantoSito: '20009999', impiantoRegistro: '20000001' },
    ]);
  });

  it('un ODL multi-matricola è chiuso se ALMENO una riga è chiusa positiva', () => {
    const out = confrontaEsitiSito(
      [esec()],
      [registro({ aperto: true, esito_positivo: null }), registro()],
    );
    expect(out.allineati).toBe(1);
    expect(out.mancantiSulSito).toEqual([]);
  });
});
