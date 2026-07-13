import { describe, it, expect } from 'vitest';
import { righeMisuratoriDaRimuovere } from './misuratoriDaRimuovere';

describe('righeMisuratoriDaRimuovere', () => {
  it('rimuove le righe il cui intervento non qualifica più, in QUALSIASI stato', () => {
    // r2 e r3 non sono più qualificanti: vanno rimossi anche se già avanzati nel
    // flusso logistico (lo stato non è nemmeno un input della decisione).
    const existing = [
      { id: 'r1', intervento_id: 'i1' },
      { id: 'r2', intervento_id: 'i2' },
      { id: 'r3', intervento_id: 'i3' },
    ];
    expect(righeMisuratoriDaRimuovere(existing, new Set(['i1']))).toEqual(['r2', 'r3']);
  });

  it('non tocca le righe di interventi ancora qualificanti', () => {
    const existing = [
      { id: 'r1', intervento_id: 'i1' },
      { id: 'r2', intervento_id: 'i2' },
    ];
    expect(righeMisuratoriDaRimuovere(existing, new Set(['i1', 'i2']))).toEqual([]);
  });

  it('guardrail: set qualificante vuoto → non rimuove nulla', () => {
    const existing = [
      { id: 'r1', intervento_id: 'i1' },
      { id: 'r2', intervento_id: 'i2' },
    ];
    expect(righeMisuratoriDaRimuovere(existing, new Set())).toEqual([]);
  });

  it('ignora le righe orfane senza intervento_id (gestite dal cascade)', () => {
    const existing = [
      { id: 'r1', intervento_id: null },
      { id: 'r2', intervento_id: 'i2' },
    ];
    expect(righeMisuratoriDaRimuovere(existing, new Set(['i9']))).toEqual(['r2']);
  });

  it('lista vuota → nessuna rimozione', () => {
    expect(righeMisuratoriDaRimuovere([], new Set(['i1']))).toEqual([]);
  });
});
