import { describe, it, expect } from 'vitest';
import { seedRisposteDaAnagrafica } from './seedRisposteDaAnagrafica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campo = (chiave: string, tipo: TemplateCampo['tipo'] = 'testo'): TemplateCampo => ({
  chiave, etichetta: chiave, tipo, ordine: 1,
});

describe('seedRisposteDaAnagrafica', () => {
  it('pre-riempie un campo esito con la stessa chiave dell anagrafica', () => {
    const out = seedRisposteDaAnagrafica({}, { matricola: 'A123', via: 'Roma 1' }, [campo('matricola'), campo('via')]);
    expect(out).toEqual({ matricola: 'A123', via: 'Roma 1' });
  });

  it('usa gli alias (indirizzo→via, odsodl→odl)', () => {
    const out = seedRisposteDaAnagrafica({}, { via: 'Roma 1', odl: 'OD9' }, [campo('indirizzo'), campo('odsodl')]);
    expect(out).toEqual({ indirizzo: 'Roma 1', odsodl: 'OD9' });
  });

  it('non sovrascrive una risposta già compilata', () => {
    const out = seedRisposteDaAnagrafica({ matricola: 'GIA' }, { matricola: 'A123' }, [campo('matricola')]);
    expect(out.matricola).toBe('GIA');
  });

  it('ignora i campi foto e crocetta', () => {
    const out = seedRisposteDaAnagrafica({}, { via: 'Roma 1' }, [campo('via', 'foto'), campo('via', 'crocetta')]);
    expect(out).toEqual({});
  });

  it('lascia invariato se non c è dato anagrafica corrispondente', () => {
    const out = seedRisposteDaAnagrafica({ note: 'x' }, { matricola: 'A123' }, [campo('sigillo'), campo('note')]);
    expect(out).toEqual({ note: 'x' });
  });

  it('non introduce valori vuoti dall anagrafica', () => {
    const out = seedRisposteDaAnagrafica({}, { matricola: '  ' }, [campo('matricola')]);
    expect(out).toEqual({});
  });
});
