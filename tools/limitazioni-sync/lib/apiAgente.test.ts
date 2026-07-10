// tools/limitazioni-sync/lib/apiAgente.test.ts
import { describe, it, expect, vi } from 'vitest';
import { baseUrlDaEndpoint, tick, inviaReport, fetchSaracinesche } from './apiAgente.mjs';

describe('baseUrlDaEndpoint', () => {
  it('estrae origin da un endpoint completo', () => {
    expect(baseUrlDaEndpoint('https://app.vercel.app/api/export/limitazioni-massive'))
      .toBe('https://app.vercel.app');
  });
  it('regge porta e localhost', () => {
    expect(baseUrlDaEndpoint('http://localhost:3000/api/export/x')).toBe('http://localhost:3000');
  });
});

describe('tick', () => {
  it('POST /api/agente/tick con header chiave e body { files }', async () => {
    const files = [{ nome: 'ZAGAROLO.xlsx', isMaster: true, colonne: ['ORDINE'] }];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ eseguiOra: true, dryRun: false, finestraGiorni: 15, mappatura: [], esitoPositivo: 'eseguito', esitoNegativo: 'No' }),
    }));
    const out = await tick({ baseUrl: 'https://app.vercel.app', exportKey: 'K', files }, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/agente/tick');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ files });
    expect(out.eseguiOra).toBe(true);
  });

  it('risposta non ok → throw con status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'no' }));
    await expect(tick({ baseUrl: 'https://x', exportKey: 'K', files: [] }, fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});

describe('inviaReport', () => {
  it('POST /api/agente/report con il report nel body', async () => {
    const report = { dryRun: true, file: [], extraNonCollocate: [] };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    const out = await inviaReport({ baseUrl: 'https://app.vercel.app', exportKey: 'K', report }, fetchImpl as unknown as typeof fetch);

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/agente/report');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(JSON.parse(opts.body)).toEqual(report);
    expect(out).toEqual({ ok: true });
  });
});

describe('fetchSaracinesche', () => {
  it('GET /api/export/acea-saracinesche con header chiave → righe', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 1, righe: [{ odl: '957276080', saracinesca: 'SI' }] }),
    }));
    const righe = await fetchSaracinesche(
      { baseUrl: 'https://app.vercel.app', exportKey: 'K' },
      fetchImpl as unknown as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/export/acea-saracinesche');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(righe).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('risposta non ok → throw con status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'errore' }));
    await expect(
      fetchSaracinesche({ baseUrl: 'https://x', exportKey: 'K' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/500/);
  });

  it('risposta senza array righe → throw', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ count: 0 }) }));
    await expect(
      fetchSaracinesche({ baseUrl: 'https://x', exportKey: 'K' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/righe/);
  });

  it('timeout: fetch che non risponde entro timeoutMs → throw con messaggio chiaro', async () => {
    const fetchImpl = vi.fn((_url: string, opts: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    await expect(
      fetchSaracinesche(
        { baseUrl: 'https://x', exportKey: 'K', timeoutMs: 20 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/timeout dopo 20ms/);
  });
});
