import { describe, it, expect } from 'vitest';
import { buildZipEntries, type FotoZip } from './buildZipEntries';

// I nomi seguono il formato attuale `<identificativo>_<Etichetta>.<ext>` (vedi nomeFotoFile).
const f = (p: Partial<FotoZip>): FotoZip => ({
  richiesta_id: 'req1', storage_path: 'req1/foto_contatore_req1.jpg',
  file_name: '12345_FotoContatore.jpg', ...p,
});

describe('buildZipEntries', () => {
  it('nomi unici → entry alla radice dello ZIP', () => {
    const entries = buildZipEntries([
      f({ file_name: '12345_FotoContatore.jpg', storage_path: 'a.jpg' }),
      f({ file_name: '12345_FotoSigillo.jpg', storage_path: 'b.jpg' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['12345_FotoContatore.jpg', '12345_FotoSigillo.jpg']);
  });

  it('nomi coincidenti → sottocartella per identificativo (de-duplicati)', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '12345_FotoContatore.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: '12345_FotoContatore.jpg', storage_path: 'B.jpg' }),
    ]);
    // entrambe collidono su '12345_FotoContatore.jpg' → vanno sotto '<identificativo>/'
    // (la parte PRIMA del primo '_', non l'etichetta) — la seconda riceve suffisso
    const paths = entries.map((e) => e.zipPath);
    expect(new Set(paths).size).toBe(2);
    expect(paths.every((p) => p.startsWith('12345/'))).toBe(true);
  });

  it('collisione anche dentro la stessa sottocartella → suffisso progressivo', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '77_Foto.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: '77_Foto.jpg', storage_path: 'B.jpg' }),
      f({ richiesta_id: 'C', file_name: '77_Foto.jpg', storage_path: 'C.jpg' }),
    ]);
    const paths = entries.map((e) => e.zipPath);
    // tutti distinti: stessa sottocartella '77/' ma nomi de-duplicati
    expect(new Set(paths).size).toBe(3);
    expect(paths.every((p) => p.startsWith('77/'))).toBe(true);
  });

  it('nome senza underscore su collisione → fallback richiesta_id come sottocartella', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: 'foto.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: 'foto.jpg', storage_path: 'B.jpg' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['A/foto.jpg', 'B/foto.jpg']);
  });

  it('preserva storage_path per il download', () => {
    const entries = buildZipEntries([f({ storage_path: 'req1/x.jpg', file_name: '1_A.jpg' })]);
    expect(entries[0].storagePath).toBe('req1/x.jpg');
  });

  it('lista vuota → nessuna entry', () => {
    expect(buildZipEntries([])).toEqual([]);
  });

  it('caso reale PASTORELLI LUIGI (lim_massive, priorità odl→matricola): stesso ODL, 2 misuratori → suffisso matricola, non "(2)"', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '912231902_AntePanoramica.jpg', storage_path: 'A.jpg', matricola: '202015210425' }),
      f({ richiesta_id: 'B', file_name: '912231902_AntePanoramica.jpg', storage_path: 'B.jpg', matricola: '202015210415' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual([
      '912231902/912231902_AntePanoramica (202015210425).jpg',
      '912231902/912231902_AntePanoramica (202015210415).jpg',
    ]);
  });

  it('matricola nota solo su UNA delle due colliding → fallback al contatore per entrambe (niente stili misti)', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '912_Foto.jpg', storage_path: 'A.jpg', matricola: '111' }),
      f({ richiesta_id: 'B', file_name: '912_Foto.jpg', storage_path: 'B.jpg', matricola: null }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['912/912_Foto.jpg', '912/912_Foto (2).jpg']);
  });

  it('matricole colliding UGUALI (vero duplicato) → fallback al contatore, non due nomi identici', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '912_Foto.jpg', storage_path: 'A.jpg', matricola: '111' }),
      f({ richiesta_id: 'B', file_name: '912_Foto.jpg', storage_path: 'B.jpg', matricola: '111' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['912/912_Foto.jpg', '912/912_Foto (2).jpg']);
  });

  it('matricola assente su tutte (comportamento storico) → contatore progressivo invariato', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '912_Foto.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: '912_Foto.jpg', storage_path: 'B.jpg' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['912/912_Foto.jpg', '912/912_Foto (2).jpg']);
  });

  it('tre colliding con tre matricole distinte → tutte disambiguate simmetricamente', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: '912_Foto.jpg', storage_path: 'A.jpg', matricola: '111' }),
      f({ richiesta_id: 'B', file_name: '912_Foto.jpg', storage_path: 'B.jpg', matricola: '222' }),
      f({ richiesta_id: 'C', file_name: '912_Foto.jpg', storage_path: 'C.jpg', matricola: '333' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual([
      '912/912_Foto (111).jpg', '912/912_Foto (222).jpg', '912/912_Foto (333).jpg',
    ]);
  });
});
