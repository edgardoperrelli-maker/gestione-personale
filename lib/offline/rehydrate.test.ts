import { describe, it, expect } from 'vitest';
import { mergeLavoro, risolviFotoPlaceholder, vociDaRiparare } from './rehydrate';
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

describe('risolviFotoPlaceholder', () => {
  it('sostituisce il placeholder col path reale da dbLavoro', () => {
    const voci: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc', testo: 'x' } }];
    const out = risolviFotoPlaceholder(voci, [lav('v1', { foto: 'rapportini/r/foto.jpg', testo: 'x' })]);
    expect(out[0].risposte).toEqual({ foto: 'rapportini/r/foto.jpg', testo: 'x' });
  });
  it('NON tocca i campi non-placeholder (niente clobber di altre modifiche)', () => {
    // Nel componente `testo` è 'nuovo' (modifica in corso), in dbLavoro è 'vecchio': resta 'nuovo'.
    const voci: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc', testo: 'nuovo' } }];
    const out = risolviFotoPlaceholder(voci, [lav('v1', { foto: 'rapportini/r/foto.jpg', testo: 'vecchio' })]);
    expect(out[0].risposte).toEqual({ foto: 'rapportini/r/foto.jpg', testo: 'nuovo' });
  });
  it('lascia il placeholder se in dbLavoro è ancora placeholder (foto non ancora caricata)', () => {
    const voci: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc' } }];
    const out = risolviFotoPlaceholder(voci, [lav('v1', { foto: 'blob-locale:abc' })]);
    expect(out[0].risposte).toEqual({ foto: 'blob-locale:abc' });
    expect(out[0]).toBe(voci[0]); // invariato → stesso riferimento
  });
  it('non muta gli input', () => {
    const voci: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc' } }];
    risolviFotoPlaceholder(voci, [lav('v1', { foto: 'rapportini/r/foto.jpg' })]);
    expect(voci[0].risposte).toEqual({ foto: 'blob-locale:abc' });
  });
});

describe('vociDaRiparare', () => {
  it('segnala la voce dove il server ha placeholder e il telefono ha il path reale', () => {
    const server: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc', testo: 'x' } }];
    const out = vociDaRiparare(server, [lav('v1', { foto: 'rapportini/r/foto.jpg', testo: 'x' })]);
    expect(out).toEqual(['v1']);
  });
  it('NON segnala se il server ha già il path reale', () => {
    const server: V[] = [{ id: 'v1', risposte: { foto: 'rapportini/r/foto.jpg' } }];
    const out = vociDaRiparare(server, [lav('v1', { foto: 'rapportini/r/foto.jpg' })]);
    expect(out).toEqual([]);
  });
  it('NON segnala se anche il telefono ha ancora il placeholder (foto mai caricata)', () => {
    const server: V[] = [{ id: 'v1', risposte: { foto: 'blob-locale:abc' } }];
    const out = vociDaRiparare(server, [lav('v1', { foto: 'blob-locale:abc' })]);
    expect(out).toEqual([]);
  });
  it('considera più voci e ritorna solo quelle da riparare', () => {
    const server: V[] = [
      { id: 'v1', risposte: { foto: 'blob-locale:a' } },
      { id: 'v2', risposte: { foto: 'rapportini/r/ok.jpg' } },
      { id: 'v3', risposte: { foto: 'blob-locale:c' } },
    ];
    const out = vociDaRiparare(server, [
      lav('v1', { foto: 'rapportini/r/uno.jpg' }),
      lav('v2', { foto: 'rapportini/r/ok.jpg' }),
      lav('v3', { foto: 'blob-locale:c' }), // telefono ancora placeholder → non riparabile
    ]);
    expect(out).toEqual(['v1']);
  });
});
