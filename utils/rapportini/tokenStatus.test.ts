import { describe, it, expect } from 'vitest';
import { tokenStatus } from './tokenStatus';
const base = { stato: 'in_corso' as const, expires_at: '2026-06-01T12:00:00Z' };
describe('tokenStatus', () => {
  it('inviato vince', () => { expect(tokenStatus({ ...base, stato: 'inviato' }, '2026-05-31T10:00:00Z')).toBe('inviato'); });
  it('scaduto', () => { expect(tokenStatus(base, '2026-06-01T12:00:01Z')).toBe('scaduto'); });
  it('valido', () => { expect(tokenStatus(base, '2026-05-31T10:00:00Z')).toBe('valido'); });
});
