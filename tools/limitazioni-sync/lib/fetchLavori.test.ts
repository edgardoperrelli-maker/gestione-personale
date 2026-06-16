// tools/limitazioni-sync/lib/fetchLavori.test.ts
import { describe, it, expect } from 'vitest';
import { fetchLavori } from './fetchLavori.mjs';

describe('fetchLavori', () => {
  it('chiama endpoint con header segreto e ritorna righe', async () => {
    let urlChiamato = '';
    let headerKey = '';
    const fakeFetch = async (url: string, opts: { headers: Record<string, string> }) => {
      urlChiamato = url;
      headerKey = opts.headers['x-export-key'];
      return { ok: true, json: async () => ({ righe: [{ id: 'a' }, { id: 'b' }] }) };
    };
    const righe = await fetchLavori(
      { endpointUrl: 'https://x/api/export/limitazioni-massive', exportKey: 'segreto', from: '2026-06-02', to: '2026-06-16' },
      fakeFetch as unknown as typeof fetch,
    );
    expect(righe).toHaveLength(2);
    expect(urlChiamato).toContain('from=2026-06-02');
    expect(urlChiamato).toContain('to=2026-06-16');
    expect(headerKey).toBe('segreto');
  });
  it('lancia su risposta non ok', async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'no' });
    await expect(
      fetchLavori({ endpointUrl: 'https://x', exportKey: 'k', from: 'a', to: 'b' }, fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow('401');
  });
});
