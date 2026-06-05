// utils/rapportini/condividiFile.test.ts
import { describe, it, expect } from 'vitest';
import { supportaCondivisioneFile } from './condividiFile';

// Nota: condividiOScarica (share/download) non è testato qui — richiede jsdom
// (navigator.share + document.createElement). Verificato manualmente su dispositivo mobile.
const file = new Blob(['x'], { type: 'application/pdf' });

describe('supportaCondivisioneFile', () => {
  it('true quando share e canShare ci sono e canShare ritorna true', () => {
    expect(supportaCondivisioneFile({ share: async () => {}, canShare: () => true }, file)).toBe(true);
  });
  it('false quando manca share', () => {
    expect(supportaCondivisioneFile({ canShare: () => true }, file)).toBe(false);
  });
  it('false quando canShare ritorna false', () => {
    expect(supportaCondivisioneFile({ share: async () => {}, canShare: () => false }, file)).toBe(false);
  });
  it('false quando navigator non supporta nulla', () => {
    expect(supportaCondivisioneFile({}, file)).toBe(false);
  });
});
