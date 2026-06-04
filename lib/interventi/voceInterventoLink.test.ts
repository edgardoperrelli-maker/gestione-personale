import { describe, it, expect } from 'vitest';
import { buildVoceInterventoLinker, type InterventoLinkRow } from './voceInterventoLink';

function it_(over: Partial<InterventoLinkRow> = {}): InterventoLinkRow {
  return { id: 'i1', staff_id: 's1', odl: null, matricola_contatore: null, pdr: null, ...over };
}

describe('buildVoceInterventoLinker', () => {
  it('aggancia per matricola quando l\'ODL manca (caso ACEA)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iA', matricola_contatore: 'M123' })]);
    expect(link({ staff_id: 's1', matricola: 'M123' })).toBe('iA');
  });

  it('aggancia per ODL (voce.odl)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iO', odl: 'ODL-9' })]);
    expect(link({ staff_id: 's1', odl: 'ODL-9' })).toBe('iO');
  });

  it('normalizza spazi e maiuscole', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iN', matricola_contatore: ' m-77 ' })]);
    expect(link({ staff_id: 's1', matricola: 'M-77' })).toBe('iN');
  });

  it('rispetta lo scoping per operatore (matricola uguale, staff diverso → no match)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iS', staff_id: 's1', matricola_contatore: 'M5' })]);
    expect(link({ staff_id: 's2', matricola: 'M5' })).toBeNull();
  });

  it('scarta le chiavi ambigue (stessa matricola su 2 interventi dello stesso operatore)', () => {
    const link = buildVoceInterventoLinker([
      it_({ id: 'iX', matricola_contatore: 'DUP' }),
      it_({ id: 'iY', matricola_contatore: 'DUP' }),
    ]);
    expect(link({ staff_id: 's1', matricola: 'DUP' })).toBeNull();
  });

  it('precedenza ODL → matricola → PDR', () => {
    const link = buildVoceInterventoLinker([
      it_({ id: 'iByOdl', odl: 'K1' }),
      it_({ id: 'iByMatr', matricola_contatore: 'K2' }),
    ]);
    // la voce ha sia odl sia matricola: vince l'ODL
    expect(link({ staff_id: 's1', odl: 'K1', matricola: 'K2' })).toBe('iByOdl');
    // solo matricola
    expect(link({ staff_id: 's1', matricola: 'K2' })).toBe('iByMatr');
  });

  it('nessuna chiave utile → null', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iZ', matricola_contatore: 'M1' })]);
    expect(link({ staff_id: 's1' })).toBeNull();
    expect(link({ staff_id: 's1', matricola: 'NOPE' })).toBeNull();
  });
});
