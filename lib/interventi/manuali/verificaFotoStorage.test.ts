import { describe, it, expect, vi } from 'vitest';
import { pathMancanti } from './verificaFotoStorage';

// Mock supabaseAdmin per evitare errore di env vars a test-load time
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {},
}));

describe('pathMancanti', () => {
  it('ritorna i path non presenti nel set', () => {
    const presenti = new Set(['a/1.jpg', 'a/3.jpg']);
    expect(pathMancanti(['a/1.jpg', 'a/2.jpg', 'a/3.jpg'], presenti)).toEqual(['a/2.jpg']);
  });
  it('tutti presenti → vuoto', () => {
    expect(pathMancanti(['x'], new Set(['x']))).toEqual([]);
  });
  it('set vuoto → tutti mancanti', () => {
    expect(pathMancanti(['x', 'y'], new Set())).toEqual(['x', 'y']);
  });
});
