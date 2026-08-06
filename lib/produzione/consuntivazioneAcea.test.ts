import { describe, it, expect } from 'vitest';
import { consuntivazioneAcea } from './consuntivazioneAcea';

const port = (odl: string, statoNorm: string, causa: string | null = 'EIES') => ({ odl, statoNorm, causa });
const reg = (odl: string, stato: string, causale: string | null = 'EIES') => ({ odl, stato, causale });

describe('consuntivazioneAcea', () => {
  it('prende i COMPLETATO del portale con la loro causale', () => {
    const m = consuntivazioneAcea({ portale: [port('A', 'COMPLETATO', 'EFRE')], registro: [] });
    expect(m.get('A')).toEqual({ causa: 'EFRE', fonte: 'portale' });
  });

  it('ignora gli ordini che il portale non dà per completati', () => {
    const m = consuntivazioneAcea({ portale: [port('A', 'ASSEGNATO')], registro: [] });
    expect(m.has('A')).toBe(false);
  });

  it('aggiunge gli ordini chiusi che solo il registro conosce', () => {
    // Il caso reale: snapshot fermo al 29/07, ACEA chiude il 04/08 → senza questa gamba
    // l'ordine sparisce da Esitato e pre-SAL benché sia consuntivato e pagabile.
    const m = consuntivazioneAcea({ portale: [], registro: [reg('B', 'COMP', 'EIES')] });
    expect(m.get('B')).toEqual({ causa: 'EIES', fonte: 'registro' });
  });

  it('il registro NON scompleta ciò che il portale dà per chiuso, e non ne sovrascrive la causale', () => {
    const m = consuntivazioneAcea({
      portale: [port('A', 'COMPLETATO', 'EFRE')],
      registro: [reg('A', 'AVVI', 'NPRT')],
    });
    expect(m.get('A')).toEqual({ causa: 'EFRE', fonte: 'portale' });
  });

  it('un ordine ancora aperto nel registro non entra', () => {
    const m = consuntivazioneAcea({ portale: [], registro: [reg('C', 'AVVI')] });
    expect(m.has('C')).toBe(false);
  });

  it('deduplica: righe ripetute (paginazione sotto upsert) contano una volta sola', () => {
    const m = consuntivazioneAcea({
      portale: [port('A', 'COMPLETATO'), port('A', 'COMPLETATO')],
      registro: [reg('A', 'COMP')],
    });
    expect(m.size).toBe(1);
  });

  it('`escludi` toglie gli ordini fuori vista (gas riclassificato) da entrambe le fonti', () => {
    const m = consuntivazioneAcea({
      portale: [port('GAS', 'COMPLETATO')],
      registro: [reg('GAS2', 'COMP')],
      escludi: (odl) => odl.startsWith('GAS'),
    });
    expect(m.size).toBe(0);
  });

  it('normalizza spazi e maiuscole dello stato registro, e scarta gli ODL vuoti', () => {
    const m = consuntivazioneAcea({
      portale: [port('  ', 'COMPLETATO')],
      registro: [reg(' D ', ' comp ')],
    });
    expect([...m.keys()]).toEqual(['D']);
  });
});
