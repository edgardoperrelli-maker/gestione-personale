import { describe, it, expect, vi, afterEach } from 'vitest';
import { caricaFotoDiretta, salvaVoceDiretta } from './uploadFotoDiretto';

/** Risposta fetch minimale per i test (solo i campi usati dalle funzioni). */
function resp(ok: boolean, body: unknown = {}): Response {
  return { ok, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('caricaFotoDiretta', () => {
  it('carica sul giusto endpoint (con file + clientKey) e ritorna il path del server', async () => {
    let urlChiamato = '';
    let body: FormData | undefined;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      urlChiamato = url;
      body = init?.body as FormData;
      return resp(true, { path: 'rapportini/rap1/abc.jpg' });
    }) as unknown as typeof fetch;

    const path = await caricaFotoDiretta('TOK1', new Blob(['x'], { type: 'image/jpeg' }), fetchFn);

    expect(path).toBe('rapportini/rap1/abc.jpg');
    expect(urlChiamato).toBe('/api/r/TOK1/foto-campo');
    expect(body?.get('file')).toBeInstanceOf(Blob);
    expect(typeof body?.get('clientKey')).toBe('string');
    expect((body?.get('clientKey') as string).length).toBeGreaterThan(0);
  });

  it('ritorna null se il server risponde non-ok (es. 500 storage)', async () => {
    const fetchFn = vi.fn(async () => resp(false)) as unknown as typeof fetch;
    expect(await caricaFotoDiretta('TOK1', new Blob(['x']), fetchFn)).toBeNull();
  });

  it('ritorna null se la risposta non contiene un path valido', async () => {
    const fetchFn = vi.fn(async () => resp(true, {})) as unknown as typeof fetch;
    expect(await caricaFotoDiretta('TOK1', new Blob(['x']), fetchFn)).toBeNull();
  });

  it('ritorna null su errore di rete (fetch che lancia)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await caricaFotoDiretta('TOK1', new Blob(['x']), fetchFn)).toBeNull();
  });

  it('non tocca la rete se il device è offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await caricaFotoDiretta('TOK1', new Blob(['x']), fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('salvaVoceDiretta', () => {
  it('POSTa voceId/taskId/risposte in JSON e ritorna true su 2xx', async () => {
    let body: unknown;
    let url = '';
    const fetchFn = vi.fn(async (u: string, init?: RequestInit) => {
      url = u;
      body = JSON.parse(String(init?.body));
      return resp(true, { ok: true });
    }) as unknown as typeof fetch;

    const ok = await salvaVoceDiretta('TOK1', 'v1', { foto: 'rapportini/rap1/abc.jpg' }, 'task9', fetchFn);

    expect(ok).toBe(true);
    expect(url).toBe('/api/r/TOK1/voce');
    expect(body).toEqual({ voceId: 'v1', taskId: 'task9', risposte: { foto: 'rapportini/rap1/abc.jpg' } });
  });

  it('ritorna false se il server rifiuta (non-ok)', async () => {
    const fetchFn = vi.fn(async () => resp(false)) as unknown as typeof fetch;
    expect(await salvaVoceDiretta('TOK1', 'v1', {}, undefined, fetchFn)).toBe(false);
  });

  it('ritorna false su errore di rete', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await salvaVoceDiretta('TOK1', 'v1', {}, undefined, fetchFn)).toBe(false);
  });

  it('non tocca la rete se il device è offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchFn = vi.fn() as unknown as typeof fetch;
    expect(await salvaVoceDiretta('TOK1', 'v1', {}, undefined, fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
