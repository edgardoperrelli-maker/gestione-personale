import { describe, it, expect } from 'vitest';
import { buildZipEntries, type FotoZip } from './buildZipEntries';

const f = (p: Partial<FotoZip>): FotoZip => ({
  richiesta_id: 'req1', storage_path: 'req1/foto_contatore_req1.jpg',
  file_name: 'FotoContatore_12345.jpg', ...p,
});

describe('buildZipEntries', () => {
  it('nomi unici → entry alla radice dello ZIP', () => {
    const entries = buildZipEntries([
      f({ file_name: 'FotoContatore_12345.jpg', storage_path: 'a.jpg' }),
      f({ file_name: 'FotoSigillo_12345.jpg', storage_path: 'b.jpg' }),
    ]);
    expect(entries.map((e) => e.zipPath)).toEqual(['FotoContatore_12345.jpg', 'FotoSigillo_12345.jpg']);
  });

  it('nomi coincidenti → sottocartella per identificativo (de-duplicati)', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: 'FotoContatore_12345.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: 'FotoContatore_12345.jpg', storage_path: 'B.jpg' }),
    ]);
    // entrambe collidono su 'FotoContatore_12345.jpg' → vanno sotto '<identificativo>/'
    // la seconda riceve suffisso per de-duplicazione
    const paths = entries.map((e) => e.zipPath);
    expect(new Set(paths).size).toBe(2);
    expect(paths.every((p) => p.startsWith('12345/'))).toBe(true);
  });

  it('collisione anche dentro la stessa sottocartella → suffisso progressivo', () => {
    const entries = buildZipEntries([
      f({ richiesta_id: 'A', file_name: 'Foto_77.jpg', storage_path: 'A.jpg' }),
      f({ richiesta_id: 'B', file_name: 'Foto_77.jpg', storage_path: 'B.jpg' }),
      f({ richiesta_id: 'C', file_name: 'Foto_77.jpg', storage_path: 'C.jpg' }),
    ]);
    const paths = entries.map((e) => e.zipPath);
    // tutti distinti: stessa sottocartella '77/' ma nomi de-duplicati
    expect(new Set(paths).size).toBe(3);
    expect(paths.every((p) => p.startsWith('77/'))).toBe(true);
  });

  it('preserva storage_path per il download', () => {
    const entries = buildZipEntries([f({ storage_path: 'req1/x.jpg', file_name: 'A_1.jpg' })]);
    expect(entries[0].storagePath).toBe('req1/x.jpg');
  });

  it('lista vuota → nessuna entry', () => {
    expect(buildZipEntries([])).toEqual([]);
  });
});
