import { describe, it, expect } from 'vitest';
import { ordineInvio, classificaEsito } from './syncPlan';
import type { OutboxItem } from './types';

const base = { token: 'tok', tentativi: 0, stato: 'in_attesa' as const };
function it_(type: OutboxItem['type'], id: string, createdAt: number, payload: unknown): OutboxItem {
  return { ...base, id, type, createdAt, payload } as OutboxItem;
}

describe('ordineInvio', () => {
  it('mette le foto prima delle voci', () => {
    const voce = it_('voce', 'a', 10, { voceId: 'v1', risposte: {} });
    const foto = it_('foto', 'b', 20, { voceId: 'v1', chiave: 'f', blobId: 'bl', clientKey: 'k' });
    expect(ordineInvio([voce, foto]).map((x) => x.type)).toEqual(['foto', 'voce']);
  });
  it('mette invia per ultimo', () => {
    const invia = it_('invia', 'a', 5, {});
    const voce = it_('voce', 'b', 10, { voceId: 'v1', risposte: {} });
    expect(ordineInvio([invia, voce]).map((x) => x.type)).toEqual(['voce', 'invia']);
  });
  it('esclude invia se resta una voce bloccata', () => {
    const invia = it_('invia', 'a', 5, {});
    const voce = { ...it_('voce', 'b', 10, { voceId: 'v1', risposte: {} }), stato: 'bloccato' as const };
    expect(ordineInvio([invia, voce]).find((x) => x.type === 'invia')).toBeUndefined();
  });
  it('a parità di priorità ordina per createdAt', () => {
    const v2 = it_('voce', 'a', 30, { voceId: 'v2', risposte: {} });
    const v1 = it_('voce', 'b', 10, { voceId: 'v1', risposte: {} });
    expect(ordineInvio([v2, v1]).map((x) => x.createdAt)).toEqual([10, 30]);
  });
});

describe('classificaEsito', () => {
  it('2xx → completato', () => {
    expect(classificaEsito(200).esito).toBe('completato');
    expect(classificaEsito(204).esito).toBe('completato');
  });
  it('409/403/422 → bloccato', () => {
    expect(classificaEsito(409).esito).toBe('bloccato');
    expect(classificaEsito(403).esito).toBe('bloccato');
    expect(classificaEsito(422).esito).toBe('bloccato');
  });
  it('transitori (0 rete, 429, 5xx) → ritenta', () => {
    expect(classificaEsito(500).esito).toBe('ritenta');
    expect(classificaEsito(503).esito).toBe('ritenta');
    expect(classificaEsito(429).esito).toBe('ritenta');
    expect(classificaEsito(0).esito).toBe('ritenta');
  });
  it('4xx non transitori (400/404) → bloccato', () => {
    expect(classificaEsito(400).esito).toBe('bloccato');
    expect(classificaEsito(404).esito).toBe('bloccato');
  });
});
