import { describe, it, expect } from 'vitest';
import { whatsappHref, statoBadge } from './links';

describe('whatsappHref', () => {
  it('costruisce un link wa.me con testo e url codificati', () => {
    const href = whatsappHref('Mario', '01/06/2026', 'https://x.app/r/abc');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
    expect(text).toContain('Mario');
    expect(text).toContain('01/06/2026');
    expect(text).toContain('https://x.app/r/abc');
  });
  it('include il saluto personalizzato e la firma dell’ufficio', () => {
    const href = whatsappHref('Mario', '01/06/2026', 'https://x.app/r/abc');
    const text = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
    expect(text).toContain('Ciao Mario');
    expect(text).toContain('Ufficio Plenzich');
  });
  it('gestisce staffName null senza rompersi', () => {
    expect(whatsappHref(null, '01/06/2026', 'https://x.app/r/abc')).toContain('wa.me');
  });
});

describe('statoBadge', () => {
  it('mappa gli stati alle etichette', () => {
    expect(statoBadge('inviato').label).toBe('Inviato');
    expect(statoBadge('scaduto').label).toBe('Scaduto');
    expect(statoBadge('valido').label).toBe('In corso');
  });
});
