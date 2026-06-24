import { describe, it, expect } from 'vitest';
import { ordineInvio, classificaEsito, deveRilasciareFoto, modoInvioManuale, esitoInvioManuale, GRACE_CONFERMA_MS } from './syncPlan';
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
  it('400 ha un motivo dedicato (voce non più presente → riapri), non il generico', () => {
    const e = classificaEsito(400);
    expect(e).toEqual({ esito: 'bloccato', motivo: 'Intervento non più disponibile — riapri il link' });
  });
  it('404 resta sul motivo generico "Richiesta non valida"', () => {
    expect(classificaEsito(404)).toEqual({ esito: 'bloccato', motivo: 'Richiesta non valida' });
  });
});

describe('deveRilasciareFoto', () => {
  it('rilascia solo con 2xx E fotoComplete', () => {
    expect(deveRilasciareFoto(200, true)).toBe(true);
    expect(deveRilasciareFoto(201, true)).toBe(true);
  });
  it('non rilascia se 2xx ma foto incomplete', () => {
    expect(deveRilasciareFoto(200, false)).toBe(false);
  });
  it('non rilascia su errori (5xx, 4xx, rete)', () => {
    expect(deveRilasciareFoto(502, true)).toBe(false);
    expect(deveRilasciareFoto(422, true)).toBe(false);
    expect(deveRilasciareFoto(0, true)).toBe(false);
  });
});

describe('modoInvioManuale', () => {
  it('non caricato → con_foto (primo invio / riparazione)', () => {
    expect(modoInvioManuale({}, 1000)).toBe('con_foto');
  });
  it('caricato ma prima di confermaDopo → attendi', () => {
    expect(modoInvioManuale({ caricato: true, confermaDopo: 5000 }, 1000)).toBe('attendi');
  });
  it('caricato e oltre confermaDopo → senza_foto (conferma)', () => {
    expect(modoInvioManuale({ caricato: true, confermaDopo: 5000 }, 9000)).toBe('senza_foto');
  });
});

describe('esitoInvioManuale', () => {
  it('2xx + durabile → rilascia', () => {
    expect(esitoInvioManuale('senza_foto', 200, true, 0).tipo).toBe('rilascia');
  });
  it('primo invio 2xx non durabile → attesa_conferma con confermaDopo=now+GRACE', () => {
    const e = esitoInvioManuale('con_foto', 200, false, 1000);
    expect(e).toEqual({ tipo: 'attesa_conferma', confermaDopo: 1000 + GRACE_CONFERMA_MS });
  });
  it('conferma senza foto non durabile → ripara (forza re-upload)', () => {
    expect(esitoInvioManuale('senza_foto', 200, false, 1000).tipo).toBe('ripara');
  });
  it('5xx → ritenta', () => { expect(esitoInvioManuale('con_foto', 500, false, 0).tipo).toBe('ritenta'); });
  it('422 → bloccato', () => { expect(esitoInvioManuale('con_foto', 422, false, 0).tipo).toBe('bloccato'); });
});

describe('deveRilasciareFoto (durabile)', () => {
  it('rilascia solo 2xx && durabile', () => {
    expect(deveRilasciareFoto(200, true)).toBe(true);
    expect(deveRilasciareFoto(200, false)).toBe(false);
    expect(deveRilasciareFoto(500, true)).toBe(false);
  });
});
