import { describe, it, expect } from 'vitest';
import { clampDataLive, minDataLive } from './liveWindow';

describe('minDataLive', () => {
  it('ritorna oggi − 7 giorni', () => {
    expect(minDataLive('2026-06-09')).toBe('2026-06-02');
  });
});

describe('clampDataLive', () => {
  const oggi = '2026-06-09';
  it('data odierna resta', () => expect(clampDataLive('2026-06-09', oggi)).toBe('2026-06-09'));
  it('data nella finestra resta', () => expect(clampDataLive('2026-06-05', oggi)).toBe('2026-06-05'));
  it('bordo minimo (oggi−7) resta', () => expect(clampDataLive('2026-06-02', oggi)).toBe('2026-06-02'));
  it('oltre 7 giorni → oggi', () => expect(clampDataLive('2026-06-01', oggi)).toBe('2026-06-09'));
  it('data futura → oggi', () => expect(clampDataLive('2026-06-10', oggi)).toBe('2026-06-09'));
  it('formato non valido → oggi', () => expect(clampDataLive('abc', oggi)).toBe('2026-06-09'));
  it('undefined → oggi', () => expect(clampDataLive(undefined, oggi)).toBe('2026-06-09'));
});
