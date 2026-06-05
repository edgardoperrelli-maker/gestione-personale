import { describe, it, expect } from 'vitest';
import { tokenStatus } from './tokenStatus';

// Giorno lavori = lunedì 2026-06-08; "adesso" variabile.
describe('tokenStatus', () => {
  it('inviato vince anche se la data è passata', () => {
    expect(tokenStatus({ stato: 'inviato', data: '2026-01-01' }, '2026-06-10T08:00:00Z')).toBe('inviato');
  });
  it('valido il giorno dei lavori', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-08T08:00:00Z')).toBe('valido');
  });
  it('valido il giorno dopo', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-09T08:00:00Z')).toBe('valido');
  });
  it('scaduto due giorni dopo', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
  it('valido se generato in anticipo (la data dei lavori è futura)', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-05T08:00:00Z')).toBe('valido');
  });
});

describe('tokenStatus — riaperto_at', () => {
  it('riaperto da poco → valido anche se la data lavori è passata', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-01-01', riaperto_at: '2026-06-10T07:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('valido');
  });
  it('riaperto da oltre 48h → ricade sulla logica della data (scaduto)', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-01-01', riaperto_at: '2026-06-01T08:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
  it('inviato vince anche con riaperto_at recente', () => {
    expect(tokenStatus({ stato: 'inviato', data: '2026-06-08', riaperto_at: '2026-06-10T07:00:00Z' }, '2026-06-10T08:00:00Z')).toBe('inviato');
  });
  it('riaperto_at null → comportamento storico', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08', riaperto_at: null }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
});
