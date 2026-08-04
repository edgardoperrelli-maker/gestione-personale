import { describe, it, expect } from 'vitest';
import { parseMasterUpload, spartiUtenzaImpianto, trovaHeaderMaster } from './masterUpload';

describe('trovaHeaderMaster', () => {
  it("trova l'header anche dopo righe di preambolo", () => {
    const rows = [
      ['LIMITAZIONI MASSIVE — COMUNE DI LABICO'],
      [],
      ['Ordine', 'Matricola misuratore', 'Indirizzo', 'Località', 'Operazione testo breve'],
      ['912000001', 'M1', 'VIA ROMA 1', 'LABICO', 'Limitazione'],
    ];
    expect(trovaHeaderMaster(rows)).toBe(2);
  });
  it('preferisce la riga con ODL + almeno un altro campo a quella col solo ODL', () => {
    const rows = [
      ['Ordine'],
      ['Ordine', 'Matricola'],
    ];
    expect(trovaHeaderMaster(rows)).toBe(1);
  });
  it('senza colonna ODL: -1', () => {
    expect(trovaHeaderMaster([['Matricola', 'Indirizzo']])).toBe(-1);
  });
  it('"Coordinate" NON è la colonna ordine', () => {
    expect(trovaHeaderMaster([['Coordinate', 'Matricola']])).toBe(-1);
  });
});

describe('parseMasterUpload', () => {
  it('mappa le colonne per nome (accenti/maiuscole indifferenti) e scarta le righe senza ODL', () => {
    const out = parseMasterUpload([
      ['ORDINE', 'MATRICOLA', 'INDIRIZZO', 'C.A.P.', 'LOCALITÀ', 'OPERAZIONE'],
      [' 912000001 ', ' M1 ', 'VIA ROMA 1', '00030', 'LABICO', 'Limitazione'],
      ['', 'M2', 'VIA MILANO 2', '00060', 'RIANO', ''],
      [],
    ]);
    expect(out.righe).toEqual([
      {
        odl: '912000001', matricola: 'M1', impianto: '', indirizzo: 'VIA ROMA 1', cap: '00030',
        comune: 'LABICO', operazione: 'Limitazione', nominativo: '', recapito: '',
      },
    ]);
    expect(out.totale).toBe(2);
    expect(out.scartate).toBe(1);
  });
  it('campi assenti nel file → stringa vuota (li riempiranno le altre fonti, se possono)', () => {
    const out = parseMasterUpload([
      ['Ordine', 'Matricola'],
      ['1', 'M1'],
    ]);
    expect(out.righe[0]).toEqual({
      odl: '1', matricola: 'M1', impianto: '', indirizzo: '', cap: '', comune: '', operazione: '',
      nominativo: '', recapito: '',
    });
  });
  it("legge l'IMPIANTO, comunque sia scritta l'intestazione", () => {
    const headers = [
      // Il nome REALE nell'estrazione AcquaLatina: il punto è la «fornitura».
      'COD_FORNITURA', 'Cod. Fornitura', 'CODICE FORNITURA', 'FORNITURA',
      'IMPIANTO', 'Impianto', 'N. impianto', 'Cod. Impianto', 'CODICE IMPIANTO', 'PDR',
    ];
    for (const header of headers) {
      const out = parseMasterUpload([['Ordine', header], ['12379743', '19633002']]);
      expect(out.righe[0].impianto, header).toBe('19633002');
    }
  });
  it('estrazione AcquaLatina: ODL + COD_FORNITURA + matricola, come arriva dal committente', () => {
    const out = parseMasterUpload([
      ['ODL', 'COD_FORNITURA', 'MATRICOLA', 'INDIRIZZO', 'COMUNE'],
      ['12379743', '19633002', '640729', 'VIA CAMPANIA 3', 'TERRACINA'],
      ['12384745', '74278859', '104690', 'VIA EMILIA SNC', 'TERRACINA'],
    ]);
    expect(out.righe.map((r) => [r.odl, r.impianto])).toEqual([
      ['12379743', '19633002'],
      ['12384745', '74278859'],
    ]);
  });
  it('"DESCRIZIONE PDR/IMPIANTO" è la descrizione dell\'ordine, non il codice impianto', () => {
    const out = parseMasterUpload([
      ['Ordine', 'DESCRIZIONE PDR/IMPIANTO', 'IMPIANTO'],
      ['12379743', 'SOSTITUZIONE MISURATORE', '19633002'],
    ]);
    expect(out.righe[0].impianto).toBe('19633002');
  });
  it("legge il NOME UTENTE, comunque sia scritta l'intestazione", () => {
    // «Utente» è il modo di dire cliente del committente; «Intestatario» e «Nominativo» sono
    // gli altri due nomi con cui lo stesso dato passa per l'ufficio.
    for (const header of ['NOME_UTENTE', 'Nome Utente', 'UTENTE', 'INTESTATARIO', 'Nominativo']) {
      const out = parseMasterUpload([['Ordine', header], ['12379743', 'BOCCIA SALVINO']]);
      expect(out.righe[0].nominativo, header).toBe('BOCCIA SALVINO');
    }
  });
  it('legge anche RAGSOC: è così che lo chiama l\'export di Latina', () => {
    /*
      Il caso reale del 2026-08-03. Il master TERRACINA01 arriva con l'intestatario nella
      colonna RAGSOC — ragione sociale — e nessuno degli altri nomi la agganciava. Il file
      entrava lo stesso, senza errori, con il nome utente VUOTO su tutte le righe: una
      colonna non riconosciuta non è un errore, è una colonna che non c'è. Sul campo
      l'operatore si trovava l'anagrafica muta su 3.940 interventi.
    */
    for (const header of ['RAGSOC', 'RagSoc', 'RAGIONE SOCIALE', 'Ragione_Sociale']) {
      const out = parseMasterUpload([['Ordine', header], ['12379743', 'CECI OTELLO']]);
      expect(out.righe[0].nominativo, header).toBe('CECI OTELLO');
    }
  });
  it('legge il RECAPITO, e non lo scambia col nome utente', () => {
    for (const header of ['RECAPITO', 'Recapito utente', 'RECAPITO TELEFONICO', 'Telefono', 'CELLULARE']) {
      const out = parseMasterUpload([['Ordine', header], ['12379743', '3331234567']]);
      expect(out.righe[0].recapito, header).toBe('3331234567');
      // Il caso insidioso: «RECAPITO UTENTE» contiene la parola «utente». Deve restare il
      // recapito — un numero di telefono nella colonna «Nome utente» è un dato sbagliato che
      // si legge come un dato buono.
      expect(out.righe[0].nominativo, header).toBe('');
    }
  });
  it('estrazione AcquaLatina completa: le due colonne convivono con le altre', () => {
    const out = parseMasterUpload([
      ['ODL', 'COD_FORNITURA', 'MATRICOLA', 'NOME_UTENTE', 'RECAPITO', 'INDIRIZZO', 'COMUNE'],
      ['12379743', '19633002', '640729', 'ROSSI MARIO', '3331234567', 'VIA CAMPANIA 3', 'TERRACINA'],
    ]);
    expect(out.righe[0]).toMatchObject({
      odl: '12379743', impianto: '19633002', matricola: '640729',
      nominativo: 'ROSSI MARIO', recapito: '3331234567',
    });
  });
  it("l'IMPIANTO da solo basta a riconoscere la riga di intestazione", () => {
    const out = parseMasterUpload([
      ['ESTRAZIONE ACQUA LATINA — LUGLIO'],
      ['ODL', 'IMPIANTO'],
      ['12379743', '19633002'],
    ]);
    expect(out.righe).toEqual([
      {
        odl: '12379743', matricola: '', impianto: '19633002', indirizzo: '', cap: '', comune: '',
        operazione: '', nominativo: '', recapito: '',
      },
    ]);
  });
  it('"DESCRIZIONE ATTIVITÀ" vale come operazione, "Descrizione Stato Ordine" no', () => {
    const out = parseMasterUpload([
      ['Ordine', 'Descrizione Stato Ordine', 'DESCRIZIONE ATTIVITÀ'],
      ['1', 'CHIUSO', 'Sospensione'],
    ]);
    expect(out.righe[0].operazione).toBe('Sospensione');
  });
  it('senza colonna ODL lancia', () => {
    expect(() => parseMasterUpload([['Matricola'], ['M1']])).toThrow(/ODL\/ORDINE/);
  });
});

describe('parseMasterUpload — battente AcquaLatina', () => {
  // L'header vero del foglio OdL di «1BATTENTE_ODL_…», nelle posizioni reali che fregano i
  // pattern generici: «Codice OdL» prima di «Codice Esterno», l'indirizzo «normalizzato»
  // (sporco) prima di quello buono.
  const HEADER = [
    'Centro Operativo', 'Id', 'Codice OdL', 'Codice Esterno', 'Utenza/impianto',
    'Ragione Sociale', 'Comune', 'Indirizzo utente normalizzato', 'Telefono',
    'Comune Utente', 'Indirizzo Utente', 'Civico', 'Suffisso Civico',
  ];
  const riga = (over: Record<number, string>) => {
    const r = ['CO LOTTO 2', '1', 'SCL289991', '12377727', '32843691 - BOSCHETTO LUCIA',
      'BOSCHETTO LUCIA', 'PONTINIA', 'STRADA DELLA STRISCIA 1401 (no Norm. 1401)', '3892599774',
      'PONTINIA', 'VIA STRISCIA', '1401', ''];
    for (const [i, v] of Object.entries(over)) r[Number(i)] = v;
    return r;
  };

  it("prende «Codice Esterno» come ODL (non «Codice OdL») e l'indirizzo utente (non il normalizzato)", () => {
    const out = parseMasterUpload([HEADER, riga({})]);
    expect(out.righe).toEqual([{
      odl: '12377727', matricola: '', impianto: '32843691', indirizzo: 'VIA STRISCIA 1401',
      cap: '', comune: 'PONTINIA', operazione: '', nominativo: 'BOSCHETTO LUCIA',
      recapito: '3892599774',
    }]);
  });
  it('civico «0» = senza civico; il suffisso si attacca col «/»; telefono «---» = vuoto', () => {
    const out = parseMasterUpload([
      HEADER,
      riga({ 11: '0', 8: '---' }),
      riga({ 3: '12379999', 11: '39', 12: 'INT' }),
    ]);
    expect(out.righe[0].indirizzo).toBe('VIA STRISCIA');
    expect(out.righe[0].recapito).toBe('');
    expect(out.righe[1].indirizzo).toBe('VIA STRISCIA 39/INT');
  });
  it("il nominativo cade sull'utenza quando manca la ragione sociale; righe senza Codice Esterno scartate", () => {
    const out = parseMasterUpload([HEADER, riga({ 5: '' }), riga({ 3: '' })]);
    expect(out.righe).toHaveLength(1);
    expect(out.righe[0].nominativo).toBe('BOSCHETTO LUCIA');
    expect(out.scartate).toBe(1);
  });
});

describe('spartiUtenzaImpianto', () => {
  it('spacca impianto e nominativo sul « - »', () => {
    expect(spartiUtenzaImpianto('19054032 - SANTE DIONISIO-SANTI ANTONIA .'))
      .toEqual({ impianto: '19054032', nominativo: 'SANTE DIONISIO-SANTI ANTONIA .' });
  });
  it('solo cifre = impianto senza intestatario; testo libero = niente', () => {
    expect(spartiUtenzaImpianto('27410580')).toEqual({ impianto: '27410580', nominativo: '' });
    expect(spartiUtenzaImpianto('BOSCHETTO LUCIA')).toEqual({ impianto: '', nominativo: '' });
  });
});
