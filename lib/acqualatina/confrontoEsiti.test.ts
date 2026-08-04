import { describe, expect, it } from 'vitest';
import {
  confrontaEsitiSito, parseEsecuzioni,
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
