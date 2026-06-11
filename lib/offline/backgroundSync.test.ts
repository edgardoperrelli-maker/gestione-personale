import { describe, it, expect } from 'vitest';
import { tokenDistinti } from './backgroundSync';
import type { OutboxItem } from './types';

const item = (token: string, id: string): OutboxItem =>
  ({ id, type: 'voce', token, createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { voceId: id, risposte: {} } });

describe('tokenDistinti', () => {
  it('restituisce i token distinti', () => {
    const out = tokenDistinti([item('a', '1'), item('a', '2'), item('b', '3')]);
    expect(out.sort()).toEqual(['a', 'b']);
  });
  it('lista vuota → array vuoto', () => {
    expect(tokenDistinti([])).toEqual([]);
  });
});
