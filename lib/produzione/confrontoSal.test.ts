import { describe, it, expect } from 'vitest';
import { confrontaSalProduzione, type IndiceOdl, type SalRigaConfronto } from './confrontoSal';
import type { RigaProduzione } from './aggregaProduzione';

const prod = (over: Partial<RigaProduzione> = {}): RigaProduzione => ({
  odl: 'A1',
  commessa: 'acea',
  voce: 10,
  kpi: 'EL',
  attivitaKey: 'LIMITAZIONE EROGAZIONE',
  attivitaLabel: 'Limitazione Erogazione',
  matricola: '',
  data: '2026-07-10',
  staffId: 's1',
  operatore: 'Mario',
  territorioId: 't1',
  territorio: 'Roma',
  valore: 25.46,
  ...over,
});

const sal = (over: Partial<SalRigaConfronto> = {}): SalRigaConfronto => ({
  sal_n: 2,
  odl: 'A1',
  doc_acquisti: 'D1',
  posizione: '10',
  valore: 25.46,
  causa: 'EFRE',
  attivita: 'Limitazione flusso idrico',
  data_completamento: '2026-07-10',
  data_registrazione: '2026-07-31',
  valoreListino: 25.46,
  attivitaKey: 'LIMITAZIONE EROGAZIONE',
  attivitaLabel: 'Limitazione Erogazione',
  ...over,
});

const indice = (over: Partial<IndiceOdl> = {}): IndiceOdl => ({
  positiviPeriodo: new Set(['A1']),
  positiviTutti: new Set(['A1']),
  noti: new Set(['A1']),
  inQualcheSal: new Set(['A1']),
  ...over,
});

describe('confrontaSalProduzione', () => {
  it('SAL e produzione allineati → differenza zero e una sola voce', () => {
    const c = confrontaSalProduzione(2, [sal()], [prod()], indice());
    expect(c).toMatchObject({ n: 2, salValoreAps: 25.46, differenza: 0, salOrdini: 1 });
    expect(c.produzione).toEqual({ conteggio: 1, valore: 25.46 });
    expect(c.perVoce).toHaveLength(1);
    expect(c.perVoce[0]).toMatchObject({ prodConteggio: 1, salConteggio: 1, delta: 0 });
  });

  it('la differenza è produzione − SAL (positiva = fatto e non ancora pagato)', () => {
    const c = confrontaSalProduzione(2, [sal()], [prod(), prod({ odl: 'A2' })], indice());
    expect(c.differenza).toBe(25.46);
  });

  it('aggancia SAL e produzione sull’attività canonica, non sul testo SAP', () => {
    // Il SAL dice "Limitazione flusso idrico", il listino "Limitazione Erogazione": una voce sola.
    const c = confrontaSalProduzione(2, [sal()], [prod()], indice());
    expect(c.perVoce.map((v) => v.chiave)).toEqual(['LIMITAZIONE EROGAZIONE']);
  });

  it('una voce prodotta e mai pagata resta con salConteggio 0', () => {
    const c = confrontaSalProduzione(
      2,
      [sal()],
      [prod(), prod({ odl: 'S1', attivitaKey: 'SOSTITUZIONE SARACINESCA', attivitaLabel: 'Sostituzione saracinesca', valore: 91.12 })],
      indice(),
    );
    const saracinesca = c.perVoce.find((v) => v.chiave === 'SOSTITUZIONE SARACINESCA');
    expect(saracinesca).toMatchObject({ prodConteggio: 1, salConteggio: 0, delta: 91.12 });
  });

  it('ordina le voci per scostamento assoluto decrescente', () => {
    const c = confrontaSalProduzione(
      2,
      [sal()],
      [prod(), prod({ odl: 'S1', attivitaKey: 'SARA', attivitaLabel: 'Saracinesca', valore: 91.12 })],
      indice(),
    );
    expect(c.perVoce[0].chiave).toBe('SARA');
  });

  it('classifica gli ODL del SAL: dentro, fuori periodo, non positivi, sconosciuti', () => {
    const righeSal = [
      sal({ odl: 'DENTRO', doc_acquisti: 'D1' }),
      sal({ odl: 'PRIMA', doc_acquisti: 'D2' }),
      sal({ odl: 'NEGATIVO', doc_acquisti: 'D3' }),
      sal({ odl: 'MAI', doc_acquisti: 'D4' }),
    ];
    const c = confrontaSalProduzione(2, righeSal, [prod({ odl: 'DENTRO' })], {
      positiviPeriodo: new Set(['DENTRO']),
      positiviTutti: new Set(['DENTRO', 'PRIMA']),
      noti: new Set(['DENTRO', 'PRIMA', 'NEGATIVO']),
      inQualcheSal: new Set(['DENTRO', 'PRIMA', 'NEGATIVO', 'MAI']),
    });
    expect(c.odl).toMatchObject({ inProduzione: 1, fuoriPeriodo: 1, nonPositivi: 1, sconosciuti: 1 });
  });

  it('conta come non pagato solo il prodotto CON un ODL', () => {
    // La limitazione massiva senza ordine ACEA non ha un ODL da reclamare: non è «non pagata».
    const c = confrontaSalProduzione(
      2,
      [sal()],
      [prod(), prod({ odl: '', attivitaKey: 'LIMITAZIONE MASSIVA' }), prod({ odl: 'NUOVO' })],
      indice(),
    );
    expect(c.odl.produzioneNonPagata).toBe(1);
  });

  it('la finestra del SAL viene dalle date di completamento, non dal periodo', () => {
    const c = confrontaSalProduzione(
      2,
      [sal({ data_completamento: '2026-07-28' }), sal({ doc_acquisti: 'D2', data_completamento: '2026-06-30' })],
      [prod()],
      indice(),
    );
    expect(c).toMatchObject({ salDal: '2026-06-30', salAl: '2026-07-28' });
  });

  it('più righe sullo stesso ODL contano una volta sola negli ordini', () => {
    const c = confrontaSalProduzione(2, [sal({ posizione: '10' }), sal({ posizione: '20' })], [prod()], indice());
    expect(c).toMatchObject({ salRighe: 2, salOrdini: 1 });
  });

  it('produzione vuota → tutto il SAL è scostamento negativo', () => {
    const c = confrontaSalProduzione(2, [sal()], [], indice({ positiviPeriodo: new Set() }));
    expect(c.differenza).toBe(-25.46);
    expect(c.produzione).toEqual({ conteggio: 0, valore: 0 });
  });
});
