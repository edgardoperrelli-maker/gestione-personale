import { describe, it, expect } from 'vitest';
import { addDaysIso } from './addDaysIso';

describe('addDaysIso', () => {
  it('+1 giorno', () => expect(addDaysIso('2026-06-03', 1)).toBe('2026-06-04'));
  it('-1 giorno', () => expect(addDaysIso('2026-06-03', -1)).toBe('2026-06-02'));
  it('cambio mese', () => expect(addDaysIso('2026-06-30', 1)).toBe('2026-07-01'));
  it('cambio anno', () => expect(addDaysIso('2025-12-31', 1)).toBe('2026-01-01'));
  it('anno bisestile', () => expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29'));
});
