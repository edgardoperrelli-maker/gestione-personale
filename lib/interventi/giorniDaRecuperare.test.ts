import { describe, expect, it } from 'vitest';
import { giorniDaRecuperare, MAX_GIORNI_RECUPERO } from './giorniDaRecuperare';

/** Finto client: risponde alla sola catena usata da `giorniDaRecuperare`. */
function db(righe: Array<Record<string, unknown>>, error?: string) {
  return {
    from: () => ({
      select: () => ({
        is: () => Promise.resolve({ data: error ? null : righe, error: error ? { message: error } : null }),
      }),
    }),
  } as never;
}

const voce = (data: string, over: Record<string, unknown> = {}) => ({
  risposte: { eseguito: 'SI' },
  approvazione_stato: null,
  rapportini: { data },
  ...over,
});

describe('giorniDaRecuperare', () => {
  it('raccoglie i giorni distinti, dal piu` vecchio', async () => {
    const g = await giorniDaRecuperare(db([
      voce('2026-07-21'), voce('2026-06-04'), voce('2026-07-21'), voce('2026-06-15'),
    ]));
    expect(g).toEqual(['2026-06-04', '2026-06-15', '2026-07-21']);
  });

  it('una voce senza esito non e` un recupero da fare', async () => {
    const g = await giorniDaRecuperare(db([
      voce('2026-06-04', { risposte: {} }),
      voce('2026-06-05', { risposte: { eseguito: '   ' } }),
      voce('2026-06-06', { risposte: null }),
    ]));
    expect(g).toEqual([]);
  });

  /*
    Per una voce RIFIUTATA l'assenza di intervento e` lo stato giusto (migration 20260810160000):
    recuperarla rimetterebbe in piedi il collegamento che quel lavoro ha tolto.
  */
  it('le voci rifiutate non si recuperano', async () => {
    const g = await giorniDaRecuperare(db([
      voce('2026-06-04', { approvazione_stato: 'rifiutato' }),
      voce('2026-06-05', { approvazione_stato: 'approvato' }),
    ]));
    expect(g).toEqual(['2026-06-05']);
  });

  it('regge l’embed reso come array invece che come oggetto', async () => {
    const g = await giorniDaRecuperare(db([voce('2026-06-04', { rapportini: [{ data: '2026-06-04' }] })]));
    expect(g).toEqual(['2026-06-04']);
  });

  it('scarta le righe senza giorno leggibile', async () => {
    const g = await giorniDaRecuperare(db([
      voce('2026-06-04', { rapportini: null }),
      voce('2026-06-05', { rapportini: { data: '  ' } }),
      voce('2026-06-06'),
    ]));
    expect(g).toEqual(['2026-06-06']);
  });

  it('tronca al tetto, tenendo le giornate piu` vecchie', async () => {
    const molte = Array.from({ length: MAX_GIORNI_RECUPERO + 5 }, (_, i) =>
      voce(`2026-06-${String((i % 28) + 1).padStart(2, '0')}`));
    const g = await giorniDaRecuperare(db(molte));
    expect(g.length).toBeLessThanOrEqual(MAX_GIORNI_RECUPERO);
    expect(g).toEqual([...g].sort());
  });

  it('un errore di lettura non passa in silenzio', async () => {
    await expect(giorniDaRecuperare(db([], 'boom'))).rejects.toThrow('boom');
  });
});
