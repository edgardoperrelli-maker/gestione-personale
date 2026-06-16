import { describe, it, expect } from 'vitest';
import { idOutboxVoce, idOutboxManuale } from './ids';

describe('id outbox', () => {
  it('voce → voce:token:voceId', () => {
    expect(idOutboxVoce('tok', 'v1')).toBe('voce:tok:v1');
  });
  it('manuale → manuale:token:richiestaId (idempotente per richiesta)', () => {
    expect(idOutboxManuale('tok', 'r-9')).toBe('manuale:tok:r-9');
  });
});
