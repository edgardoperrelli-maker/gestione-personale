import { describe, it, expect } from 'vitest';
import { daPotare, type ImportArchiviato } from './retentionArchivio';

const OGGI = '2026-07-30';

/** Un import archiviato `giorniFa` giorni prima di OGGI. */
const imp = (id: string, giorniFa: number, path: string | null = `f/${id}.xlsx`): ImportArchiviato => ({
  id,
  caricato_il: new Date(Date.parse(`${OGGI}T10:00:00Z`) - giorniFa * 86_400_000).toISOString(),
  storage_path: path,
});

describe('daPotare', () => {
  it('pota i file oltre la soglia e tiene i recenti', () => {
    const esito = daPotare(
      [imp('vecchio', 200), imp('recente', 10)],
      OGGI,
      { giorni: 180, minimoTenuti: 0 },
    );
    expect(esito.map((i) => i.id)).toEqual(['vecchio']);
  });

  it('gli ultimi `minimoTenuti` non si potano MAI, qualunque età abbiano', () => {
    // Import fermi da un anno: la retention a soli giorni svuoterebbe l'archivio proprio
    // mentre è l'unica memoria recente.
    const fermi = [imp('a', 400), imp('b', 390), imp('c', 380)];
    expect(daPotare(fermi, OGGI, { giorni: 180, minimoTenuti: 3 })).toEqual([]);
    const esito = daPotare(fermi, OGGI, { giorni: 180, minimoTenuti: 2 });
    expect(esito.map((i) => i.id)).toEqual(['a']);   // il più vecchio, oltre i 2 tenuti
  });

  it('un file dentro la soglia non si pota nemmeno oltre il minimo', () => {
    const molti = Array.from({ length: 10 }, (_, i) => imp(`i${i}`, i));
    expect(daPotare(molti, OGGI, { giorni: 180, minimoTenuti: 2 })).toEqual([]);
  });

  it('le righe senza storage_path non partecipano: il loro file non c’è già più', () => {
    const esito = daPotare(
      [imp('senza', 400, null), imp('con', 400)],
      OGGI,
      { giorni: 180, minimoTenuti: 0 },
    );
    expect(esito.map((i) => i.id)).toEqual(['con']);
  });

  it('un timestamp illeggibile non si pota: meglio un file di troppo che uno perso', () => {
    const rotto: ImportArchiviato = { id: 'x', caricato_il: 'boh', storage_path: 'f/x.xlsx' };
    expect(daPotare([rotto], OGGI, { giorni: 180, minimoTenuti: 0 })).toEqual([]);
  });

  it('«oggi» non valido: nessuna potatura invece di una sbagliata', () => {
    expect(daPotare([imp('a', 400)], 'boh', { giorni: 180, minimoTenuti: 0 })).toEqual([]);
  });

  it('elenco vuoto: elenco vuoto', () => {
    expect(daPotare([], OGGI)).toEqual([]);
  });

  it('i default esistono e tengono almeno gli ultimi 30', () => {
    const tanti = Array.from({ length: 40 }, (_, i) => imp(`i${i}`, 200 + i));
    const esito = daPotare(tanti, OGGI);
    expect(esito).toHaveLength(10);   // 40 vecchissimi − 30 tenuti
    // Si potano i PIÙ VECCHI (i30..i39): i tenuti sono i 30 più recenti (i0..i29).
    expect(esito.map((i) => i.id).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `i${30 + i}`).sort(),
    );
  });
});
