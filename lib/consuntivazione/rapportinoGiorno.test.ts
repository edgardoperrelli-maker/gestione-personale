import { describe, it, expect } from 'vitest';
import { makeFakeDb } from '@/lib/interventi/testUtils/fakeSupabase';
import { trovaRapportinoOperatoreGiorno, prossimoOrdineVoce } from './rapportinoGiorno';

describe('trovaRapportinoOperatoreGiorno', () => {
  it('nessun rapportino quel giorno → null', async () => {
    const { db } = makeFakeDb({ rapportini: [] });
    const r = await trovaRapportinoOperatoreGiorno(db, 'staff1', '2026-08-05');
    expect(r).toBeNull();
  });

  it('trova il rapportino esistente dell’operatore per quel giorno, su qualunque piano', async () => {
    const { db } = makeFakeDb({
      rapportini: [
        { id: 'rap1', staff_id: 'staff1', data: '2026-08-05', stato: 'in_corso', created_at: '2026-08-04T15:32:00Z', piano_id: 'pACEA' },
        { id: 'rapAltro', staff_id: 'staff2', data: '2026-08-05', stato: 'in_corso', created_at: '2026-08-04T15:32:00Z', piano_id: 'pACEA' },
        { id: 'rapAltroGiorno', staff_id: 'staff1', data: '2026-08-04', stato: 'in_corso', created_at: '2026-08-03T15:32:00Z', piano_id: 'pACEA' },
      ],
    });
    const r = await trovaRapportinoOperatoreGiorno(db, 'staff1', '2026-08-05');
    expect(r).toEqual({ id: 'rap1', stato: 'in_corso' });
  });

  it('preferisce il rapportino ancora aperto a uno già inviato', async () => {
    const { db } = makeFakeDb({
      rapportini: [
        { id: 'rapInviato', staff_id: 'staff1', data: '2026-08-05', stato: 'inviato', created_at: '2026-08-05T09:00:00Z' },
        { id: 'rapAperto', staff_id: 'staff1', data: '2026-08-05', stato: 'in_corso', created_at: '2026-08-05T10:00:00Z' },
      ],
    });
    const r = await trovaRapportinoOperatoreGiorno(db, 'staff1', '2026-08-05');
    expect(r).toEqual({ id: 'rapAperto', stato: 'in_corso' });
  });
});

describe('prossimoOrdineVoce', () => {
  it('rapportino senza voci → 1', async () => {
    const { db } = makeFakeDb({ rapportino_voci: [] });
    const ordine = await prossimoOrdineVoce(db, 'rap1');
    expect(ordine).toBe(1);
  });

  it('si accoda dopo il max ordine esistente', async () => {
    const { db } = makeFakeDb({
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'rap1', ordine: 3 },
        { id: 'v2', rapportino_id: 'rap1', ordine: 7 },
        { id: 'v3', rapportino_id: 'rapAltro', ordine: 99 },
      ],
    });
    const ordine = await prossimoOrdineVoce(db, 'rap1');
    expect(ordine).toBe(8);
  });
});
