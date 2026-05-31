import { describe, it, expect } from 'vitest';
import { nonConsegnati } from './nonConsegnati';
describe('nonConsegnati', () => {
  it('non inviati con data passata', () => {
    const r = [ { staff_name: 'A', data: '2026-05-30', stato: 'in_corso' }, { staff_name: 'B', data: '2026-05-30', stato: 'inviato' }, { staff_name: 'C', data: '2026-05-31', stato: 'in_corso' } ];
    expect(nonConsegnati(r, '2026-05-31')).toEqual([{ staff_name: 'A', data: '2026-05-30' }]);
  });
});
