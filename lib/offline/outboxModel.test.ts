import { describe, it, expect } from 'vitest';
import { chiaveCoalescing, applicaUpsert, marcaErrore, prossimoTentativoMs } from './outboxModel';
import type { OutboxItem } from './types';

function voce(id: string, token: string, voceId: string, risposte: Record<string, unknown>, createdAt = 1): OutboxItem {
  return { id, type: 'voce', token, createdAt, tentativi: 0, stato: 'in_attesa', payload: { voceId, risposte } } as OutboxItem;
}

describe('chiaveCoalescing', () => {
  it('le voci coalescono per (token, voceId)', () => {
    expect(chiaveCoalescing(voce('1', 'tok', 'v1', { a: 1 }))).toBe('voce:tok:v1');
  });
  it('agenda coalesce per (token, interventoId)', () => {
    const a: OutboxItem = { id: '2', type: 'agenda', token: 'tok', createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { interventoId: 'i1', azione: 'fatto' } };
    expect(chiaveCoalescing(a)).toBe('agenda:tok:i1');
  });
  it('foto/manuale/invia NON coalescono (chiave per id)', () => {
    const f: OutboxItem = { id: '3', type: 'foto', token: 'tok', createdAt: 1, tentativi: 0, stato: 'in_attesa', payload: { voceId: 'v1', chiave: 'foto1', blobId: 'b1', clientKey: 'k1' } };
    expect(chiaveCoalescing(f)).toBe('foto:3');
  });
});

describe('applicaUpsert', () => {
  it('sostituisce una voce esistente con la stessa chiave mantenendo l\'id originale', () => {
    const esistenti = [voce('1', 'tok', 'v1', { a: 1 }, 10)];
    const out = applicaUpsert(esistenti, voce('2', 'tok', 'v1', { a: 2 }, 20));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
    expect((out[0].payload as { risposte: unknown }).risposte).toEqual({ a: 2 });
    expect(out[0].createdAt).toBe(10);
  });
  it('aggiunge in coda quando non c\'è coalescing', () => {
    const esistenti = [voce('1', 'tok', 'v1', { a: 1 }, 10)];
    const f: OutboxItem = { id: '3', type: 'foto', token: 'tok', createdAt: 20, tentativi: 0, stato: 'in_attesa', payload: { voceId: 'v1', chiave: 'f', blobId: 'b', clientKey: 'k' } };
    expect(applicaUpsert(esistenti, f)).toHaveLength(2);
  });
});

describe('marcaErrore / prossimoTentativoMs', () => {
  it('incrementa i tentativi e imposta stato errore', () => {
    const out = marcaErrore(voce('1', 'tok', 'v1', { a: 1 }), 'rete');
    expect(out.tentativi).toBe(1);
    expect(out.stato).toBe('errore');
    expect(out.ultimoErrore).toBe('rete');
  });
  it('backoff esponenziale con tetto a 60s', () => {
    expect(prossimoTentativoMs(1)).toBe(1000);
    expect(prossimoTentativoMs(2)).toBe(2000);
    expect(prossimoTentativoMs(3)).toBe(4000);
    expect(prossimoTentativoMs(10)).toBe(60000);
  });
});
