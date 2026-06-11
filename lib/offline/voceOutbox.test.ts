import { describe, it, expect } from 'vitest';
import { costruisciVoceOutbox, statoBadgeDaOutbox } from './voceOutbox';
import type { OutboxItem } from './types';

describe('costruisciVoceOutbox', () => {
  it('crea un elemento voce con id canonico e payload', () => {
    const item = costruisciVoceOutbox('tok', 'v1', { a: 1 }, 1234);
    expect(item.id).toBe('voce:tok:v1');
    expect(item.type).toBe('voce');
    expect(item.token).toBe('tok');
    expect(item.createdAt).toBe(1234);
    expect(item.stato).toBe('in_attesa');
    expect(item.payload).toEqual({ voceId: 'v1', risposte: { a: 1 } });
  });
});

describe('statoBadgeDaOutbox', () => {
  const base = (stato: OutboxItem['stato']): OutboxItem =>
    ({ id: 'voce:tok:v1', type: 'voce', token: 'tok', createdAt: 1, tentativi: 0, stato, payload: { voceId: 'v1', risposte: {} } });
  it('nessun elemento → saved', () => {
    expect(statoBadgeDaOutbox(undefined)).toBe('saved');
  });
  it('in_attesa → queued', () => {
    expect(statoBadgeDaOutbox(base('in_attesa'))).toBe('queued');
  });
  it('in_invio → saving', () => {
    expect(statoBadgeDaOutbox(base('in_invio'))).toBe('saving');
  });
  it('errore → queued', () => {
    expect(statoBadgeDaOutbox(base('errore'))).toBe('queued');
  });
  it('bloccato → bloccato', () => {
    expect(statoBadgeDaOutbox(base('bloccato'))).toBe('bloccato');
  });
});
