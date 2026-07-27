import { describe, it, expect } from 'vitest';
import { buildTassonomiaIndex, chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { tassonomiaAttivitaAcea } from './tassonomiaAcea';

/** Tassonomia ridotta alle righe canoniche REALI (verificate in produzione). */
const riga = (descrizione: string, gruppo: string): TassonomiaRiga => ({
  committente: 'acea',
  descrizione,
  descrizioneNorm: chiaveTassonomia(descrizione),
  gruppo,
  attivo: true,
});

const indice = buildTassonomiaIndex([
  // NB: la forma ACEA "Limitazione Massiva su Impianto" NON è a catalogo: è un alias nel codice.
  riga('LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
  riga('Limitazione flusso idrico', 'DUNNING'),
  riga('Sospensione fornitura', 'DUNNING'),
]);

describe('tassonomiaAttivitaAcea', () => {
  it('risolve la forma ACEA delle massive alla canonica del progetto', () => {
    // È il caso che rompe tutto se sbagliato: senza l'alias di scrittura l'intervento nascerebbe
    // senza gruppo e sparirebbe dall'export limitazioni massive.
    expect(tassonomiaAttivitaAcea('Limitazione Massiva su Impianto', indice)).toEqual({
      tipo: 'LIMITAZIONI MASSIVE',
      gruppo: 'LIMITAZIONI MASSIVE',
      risolta: true,
    });
  });

  it('risolve le attività dunning che sono già a catalogo', () => {
    expect(tassonomiaAttivitaAcea('Limitazione flusso idrico', indice)).toMatchObject({
      gruppo: 'DUNNING', risolta: true,
    });
    expect(tassonomiaAttivitaAcea('Sospensione fornitura', indice)).toMatchObject({
      gruppo: 'DUNNING', risolta: true,
    });
  });

  it('un\'attività sconosciuta non blocca: passa grezza e viene segnalata', () => {
    expect(tassonomiaAttivitaAcea('Attività nuova di ACEA', indice)).toEqual({
      tipo: 'Attività nuova di ACEA', gruppo: null, risolta: false,
    });
  });

  it('senza indice (tassonomia non caricabile) degrada invece di fallire', () => {
    expect(tassonomiaAttivitaAcea('Limitazione flusso idrico', null)).toEqual({
      tipo: 'Limitazione flusso idrico', gruppo: null, risolta: false,
    });
  });

  it('attività vuota o assente', () => {
    expect(tassonomiaAttivitaAcea(null, indice)).toEqual({ tipo: null, gruppo: null, risolta: false });
    expect(tassonomiaAttivitaAcea('   ', indice)).toEqual({ tipo: null, gruppo: null, risolta: false });
  });
});
