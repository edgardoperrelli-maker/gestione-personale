import { describe, it, expect } from 'vitest';
import { nomeFileFoto } from './idempotenza';

describe('nomeFileFoto', () => {
  it('usa il clientKey sanificato quando presente', () => {
    expect(nomeFileFoto('rap1', 'abc-123', 'jpg')).toBe('rapportini/rap1/abc-123.jpg');
  });
  it('rimuove caratteri non sicuri dal clientKey', () => {
    expect(nomeFileFoto('rap1', '../../etc/passwd', 'jpg')).toBe('rapportini/rap1/etcpasswd.jpg');
  });
  it('genera un nome casuale (fallback) quando clientKey è assente', () => {
    const a = nomeFileFoto('rap1', undefined, 'jpg');
    expect(a.startsWith('rapportini/rap1/')).toBe(true);
    expect(a.endsWith('.jpg')).toBe(true);
  });
});
