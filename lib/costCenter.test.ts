import { describe, it, expect } from 'vitest';
import { resolveCostCenter, type CostCenterRange } from './costCenter';

const r = (cost_center: string, valid_from: string, valid_to: string | null): CostCenterRange =>
  ({ cost_center, valid_from, valid_to });

describe('resolveCostCenter', () => {
  it('nessun range → default', () => {
    expect(resolveCostCenter('PLENZICH', [], '2026-06-15')).toBe('PLENZICH');
  });
  it('range che copre la data → override', () => {
    expect(resolveCostCenter('PLENZICH', [r('ALESSANDRINI', '2026-06-10', '2026-06-20')], '2026-06-15')).toBe('ALESSANDRINI');
  });
  it('range fuori dalla data → default', () => {
    expect(resolveCostCenter('PLENZICH', [r('ALESSANDRINI', '2026-06-10', '2026-06-12')], '2026-06-15')).toBe('PLENZICH');
  });
  it('valid_to null = aperto → copre date successive', () => {
    expect(resolveCostCenter('PLENZICH', [r('MULTISERVIZI', '2026-06-01', null)], '2026-12-31')).toBe('MULTISERVIZI');
  });
  it('più range sovrapposti → vince il valid_from più recente', () => {
    const ranges = [r('ALESSANDRINI', '2026-06-01', '2026-06-30'), r('PASTORELLI', '2026-06-10', '2026-06-20')];
    expect(resolveCostCenter('PLENZICH', ranges, '2026-06-15')).toBe('PASTORELLI');
  });
  it('default null + nessun range → null', () => {
    expect(resolveCostCenter(null, [], '2026-06-15')).toBeNull();
  });
  it('confini inclusivi (valid_from e valid_to compresi)', () => {
    const ranges = [r('MULTISERVIZI', '2026-06-15', '2026-06-15')];
    expect(resolveCostCenter('PLENZICH', ranges, '2026-06-15')).toBe('MULTISERVIZI');
  });
});
