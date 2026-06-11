import { describe, it, expect } from 'vitest';
import { mergeLavoro } from './rehydrate';
import type { LavoroVoce } from './types';

type V = { id: string; risposte: Record<string, unknown> };
const lav = (voceId: string, risposte: Record<string, unknown>, aggiornatoIl = 1): LavoroVoce =>
  ({ chiave: `tok:${voceId}`, token: 'tok', voceId, risposte, aggiornatoIl });

describe('mergeLavoro', () => {
  it('sovrascrive le risposte della voce con quelle locali', () => {
    const voci: V[] = [{ id: 'v1', risposte: { a: 1 } }, { id: 'v2', risposte: { b: 2 } }];
    const out = mergeLavoro(voci, [lav('v1', { a: 9, c: 3 })]);
    expect(out[0].risposte).toEqual({ a: 9, c: 3 });
    expect(out[1].risposte).toEqual({ b: 2 });
  });
  it('ignora lavori senza voce corrispondente', () => {
    const voci: V[] = [{ id: 'v1', risposte: {} }];
    const out = mergeLavoro(voci, [lav('zzz', { x: 1 })]);
    expect(out).toHaveLength(1);
    expect(out[0].risposte).toEqual({});
  });
  it('non muta gli oggetti voce in input', () => {
    const voci: V[] = [{ id: 'v1', risposte: { a: 1 } }];
    const out = mergeLavoro(voci, [lav('v1', { a: 2 })]);
    expect(voci[0].risposte).toEqual({ a: 1 });
    expect(out[0]).not.toBe(voci[0]);
  });
});
