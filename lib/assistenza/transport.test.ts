import { describe, expect, it } from 'vitest';

import { comprimi, decomprimi, spezza, creaRicevitore, creaMittente, type Chunk } from './transport';

// Simula un full-snapshot rrweb reale: markup ripetitivo + CSS inlinato, ~1MB.
function snapshotFinto(kb: number): string {
  const voce = '{"type":2,"tagName":"div","attributes":{"class":"rounded-2xl border px-3 py-2"},"textContent":"VIA ROMA 17 · LABICO — LIMITAZIONE MASSIVA"},';
  return `{"type":2,"data":{"node":[${voce.repeat(Math.ceil((kb * 1024) / voce.length))}]},"timestamp":1784720000000}`;
}

describe('assistenza/transport', () => {
  it('comprimi/decomprimi: roundtrip fedele su payload grande (~1MB) e rapporto ~10x', async () => {
    const json = snapshotFinto(1024);
    const z = await comprimi(json);
    expect(z.length).toBeLessThan(json.length / 5); // markup ripetitivo → gzip molto efficace
    expect(await decomprimi(z)).toBe(json);
  });

  it('spezza: chunk ≤ size, ricomposizione identica', () => {
    const s = 'x'.repeat(250_000);
    const chunks = spezza(s, 'e1', 1, 120_000);
    expect(chunks).toHaveLength(3);
    expect(Math.max(...chunks.map((c) => c.s.length))).toBeLessThanOrEqual(120_000);
    expect(chunks.map((c) => c.s).join('')).toBe(s);
  });

  it('ricevitore: riassembla, decomprime e preserva l\'ordine anche con chunk interleaved', async () => {
    const ricevuti: unknown[] = [];
    const ricevi = creaRicevitore((e) => ricevuti.push(e));
    const ev1 = { type: 2, n: 1 };
    const ev2 = { type: 3, n: 2 };
    const c1 = spezza(await comprimi(JSON.stringify(ev1)), 'a', 1, 40);
    const c2 = spezza(await comprimi(JSON.stringify(ev2)), 'b', 1, 40);
    // interleaving: a0, b0, a1..., b1... (l'evento 1 completa comunque per primo)
    const tutti: Chunk[] = [];
    const max = Math.max(c1.length, c2.length);
    for (let i = 0; i < max; i += 1) {
      if (c1[i]) tutti.push(c1[i]);
      if (c2[i]) tutti.push(c2[i]);
    }
    tutti.forEach(ricevi);
    await new Promise((r) => setTimeout(r, 50)); // la coda async del ricevitore svuota
    expect(ricevuti).toEqual([ev1, ev2]);
  });

  it('ricevitore: gestisce anche chunk non compressi (z=0, fallback)', async () => {
    const ricevuti: unknown[] = [];
    const ricevi = creaRicevitore((e) => ricevuti.push(e));
    spezza(JSON.stringify({ ok: true }), 'p', 0).forEach(ricevi);
    await new Promise((r) => setTimeout(r, 20));
    expect(ricevuti).toEqual([{ ok: true }]);
  });

  it('mittente→ricevitore end-to-end: eventi grandi e piccoli arrivano interi e in ordine', async () => {
    const ricevuti: Array<{ i?: number }> = [];
    const ricevi = creaRicevitore((e) => ricevuti.push(e as { i?: number }));
    const ch = {
      send: async (msg: { payload: Chunk }) => {
        ricevi(msg.payload);
        return 'ok' as const;
      },
    };
    const mittente = creaMittente(ch as never);
    const grande = { i: 1, snapshot: snapshotFinto(600) };
    const piccolo = { i: 2 };
    mittente.invia(grande);
    mittente.invia(piccolo);
    await new Promise((r) => setTimeout(r, 300));
    expect(ricevuti.map((e) => e.i)).toEqual([1, 2]);
    expect(mittente.esito.persi).toBe(0);
  });

  it('mittente: un drop singolo viene recuperato dal retry, un drop doppio segnala onDrop', async () => {
    let fallisci = 1; // il primo send fallisce, il retry passa
    const ok: Chunk[] = [];
    const ch = {
      send: async (msg: { payload: Chunk }) => {
        if (fallisci > 0) { fallisci -= 1; return 'error' as const; }
        ok.push(msg.payload);
        return 'ok' as const;
      },
    };
    let drop = 0;
    const mittente = creaMittente(ch as never, () => { drop += 1; });
    mittente.invia({ a: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(ok).toHaveLength(1); // recuperato dal retry
    expect(drop).toBe(0);

    fallisci = 2; // send + retry falliscono entrambi
    mittente.invia({ a: 2 });
    await new Promise((r) => setTimeout(r, 100));
    expect(drop).toBe(1);
    expect(mittente.esito.persi).toBe(1);
  });
});
