import { describe, it, expect } from 'vitest';
import { whatsappHref, statoBadge } from './links';

describe('whatsappHref', () => {
  it('condivide solo il link (nessun testo precompilato)', () => {
    const href = whatsappHref('https://x.app/r/abc');
    expect(href).toBe('https://wa.me/?text=' + encodeURIComponent('https://x.app/r/abc'));
  });
});

describe('statoBadge', () => {
  it('mappa gli stati alle etichette', () => {
    expect(statoBadge('inviato').label).toBe('Inviato');
    expect(statoBadge('scaduto').label).toBe('Scaduto');
    expect(statoBadge('valido').label).toBe('In corso');
  });
});
