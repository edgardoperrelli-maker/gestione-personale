// utils/rapportini/riepilogoConferma.test.ts
import { describe, it, expect } from 'vitest';
import { buildRiepilogoConferma } from './riepilogoConferma';
import type { DiffRapportini } from './diffRapportini';

function diff(over: Partial<DiffRapportini> = {}): DiffRapportini {
  return { nessunaModifica: false, spostamenti: [], nuoviLink: [], svuotati: [], inviatiCoinvolti: [], bloccati: [], ...over };
}

describe('buildRiepilogoConferma', () => {
  it('elenca gli spostamenti (da → a)', () => {
    const r = buildRiepilogoConferma(diff({
      spostamenti: [{ taskId: 't1', descr: 'ODL-1', daStaffId: 's1', daNome: 'Mario', aStaffId: 's2', aNome: 'Luigi' }],
    }));
    expect(r.testo).toContain('ODL-1: Mario → Luigi');
    expect(r.haInviati).toBe(false);
  });

  it('segnala nuovi link e operatori svuotati', () => {
    const r = buildRiepilogoConferma(diff({
      nuoviLink: [{ staffId: 's3', staffName: 'Giovanni' }],
      svuotati: [{ staffId: 's1', staffName: 'Mario' }],
    }));
    expect(r.testo).toContain('Nuovo rapportino + link per Giovanni');
    expect(r.testo).toContain('Mario: nessun intervento');
  });

  it('avverte e marca haInviati quando ci sono rapportini inviati coinvolti', () => {
    const r = buildRiepilogoConferma(diff({ inviatiCoinvolti: [{ staffId: 's2', staffName: 'Luigi' }] }));
    expect(r.haInviati).toBe(true);
    expect(r.testo).toMatch(/RIAPERTI.*Luigi/);
  });
});
