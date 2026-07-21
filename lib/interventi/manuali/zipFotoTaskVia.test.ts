import { describe, it, expect } from 'vitest';
import { buildZipEntriesTaskVia, cartellaVia, type FotoManualeZip, type InfoRichiestaTaskVia } from './zipFotoTaskVia';

const foto = (p: Partial<FotoManualeZip>): FotoManualeZip => ({
  richiesta_id: 'req1',
  storage_path: 'req1/vecchio_x.jpg',
  file_name: 'VIAROMA_FotoContatoreVecchio.jpg',
  slot_chiave: 'vecchio',
  slot_etichetta: 'Foto contatore vecchio',
  ...p,
});

const info = (voci: Record<string, Partial<InfoRichiestaTaskVia>>): Map<string, InfoRichiestaTaskVia> =>
  new Map(
    Object.entries(voci).map(([id, i]) => [
      id,
      { via: 'VIA ROMA 12', matricola: '2409539', fallbackId: 'intervento', ...i },
    ]),
  );

describe('cartellaVia', () => {
  it('mantiene la via leggibile (spazi e maiuscole) e fa solo trim', () => {
    expect(cartellaVia('  VIA ROMA 12 ')).toBe('VIA ROMA 12');
  });

  it('rimuove i caratteri vietati nei filesystem e collassa gli spazi', () => {
    expect(cartellaVia('VIA A/B: "TEST"?')).toBe('VIA A B TEST');
  });

  it('toglie punti e spazi ai bordi (Windows), non quelli interni', () => {
    expect(cartellaVia('VIA G. MARCONI 10.')).toBe('VIA G. MARCONI 10');
  });

  it('via assente o vuota → stringa vuota (radice dello ZIP)', () => {
    expect(cartellaVia(null)).toBe('');
    expect(cartellaVia(undefined)).toBe('');
    expect(cartellaVia('   ')).toBe('');
  });
});

describe('buildZipEntriesTaskVia', () => {
  it('cartella per via del task padre, file per matricola + slot', () => {
    const entries = buildZipEntriesTaskVia(
      [
        foto({ slot_chiave: 'vecchio', storage_path: 'req1/a.jpg' }),
        foto({ slot_chiave: 'nuovo', storage_path: 'req1/b.jpg' }),
        foto({ slot_chiave: 'minibag', storage_path: 'req1/c.jpg' }),
      ],
      info({ req1: { via: 'VIA ROMA 12', matricola: '2409539' } }),
    );
    expect(entries.map((e) => e.zipPath)).toEqual([
      'VIA ROMA 12/2409539_vecchio.jpg',
      'VIA ROMA 12/2409539_nuovo.jpg',
      'VIA ROMA 12/2409539_minibag.jpg',
    ]);
  });

  it('due matricole sulla stessa via → stessa cartella, file distinti', () => {
    const entries = buildZipEntriesTaskVia(
      [
        foto({ richiesta_id: 'A', storage_path: 'A/v.jpg' }),
        foto({ richiesta_id: 'B', storage_path: 'B/v.jpg' }),
      ],
      info({ A: { matricola: '111' }, B: { matricola: '222' } }),
    );
    expect(entries.map((e) => e.zipPath)).toEqual([
      'VIA ROMA 12/111_vecchio.jpg',
      'VIA ROMA 12/222_vecchio.jpg',
    ]);
  });

  it('il nome usa la matricola CORRENTE, non il file_name salvato all\'upload', () => {
    const entries = buildZipEntriesTaskVia(
      [foto({ file_name: 'VIAROMA_FotoContatoreVecchio.jpg' })],
      info({ req1: { matricola: '999' } }),
    );
    expect(entries[0].zipPath).toBe('VIA ROMA 12/999_vecchio.jpg');
  });

  it('matricola normalizzata ASCII (spazi e simboli rimossi)', () => {
    const entries = buildZipEntriesTaskVia(
      [foto({})],
      info({ req1: { matricola: ' 24 09/539 ' } }),
    );
    expect(entries[0].zipPath).toBe('VIA ROMA 12/2409539_vecchio.jpg');
  });

  it('matricola assente → identificativo di riserva (fallbackId)', () => {
    const entries = buildZipEntriesTaskVia(
      [foto({})],
      info({ req1: { matricola: null, fallbackId: 'ODL9001' } }),
    );
    expect(entries[0].zipPath).toBe('VIA ROMA 12/ODL9001_vecchio.jpg');
  });

  it('via assente → foto alla radice dello ZIP', () => {
    const entries = buildZipEntriesTaskVia([foto({})], info({ req1: { via: null } }));
    expect(entries[0].zipPath).toBe('2409539_vecchio.jpg');
  });

  it('richiesta senza info → fallback "intervento" alla radice', () => {
    const entries = buildZipEntriesTaskVia([foto({ richiesta_id: 'sconosciuta' })], new Map());
    expect(entries[0].zipPath).toBe('intervento_vecchio.jpg');
  });

  it('slot_chiave assente → usa l\'etichetta normalizzata; entrambi assenti → "foto"', () => {
    const conEtichetta = buildZipEntriesTaskVia(
      [foto({ slot_chiave: null, slot_etichetta: 'Foto contatore nuovo' })],
      info({ req1: {} }),
    );
    expect(conEtichetta[0].zipPath).toBe('VIA ROMA 12/2409539_FotoContatoreNuovo.jpg');

    const senzaNulla = buildZipEntriesTaskVia(
      [foto({ slot_chiave: null, slot_etichetta: null })],
      info({ req1: {} }),
    );
    expect(senzaNulla[0].zipPath).toBe('VIA ROMA 12/2409539_foto.jpg');
  });

  it('collisione stessa matricola + stesso slot → suffisso progressivo', () => {
    const entries = buildZipEntriesTaskVia(
      [
        foto({ storage_path: 'req1/a.jpg' }),
        foto({ storage_path: 'req1/b.jpg' }),
        foto({ storage_path: 'req1/c.jpg' }),
      ],
      info({ req1: {} }),
    );
    expect(entries.map((e) => e.zipPath)).toEqual([
      'VIA ROMA 12/2409539_vecchio.jpg',
      'VIA ROMA 12/2409539_vecchio (2).jpg',
      'VIA ROMA 12/2409539_vecchio (3).jpg',
    ]);
  });

  it('estensione dallo storage_path; senza estensione → dal file_name; poi "jpg"', () => {
    const daPath = buildZipEntriesTaskVia([foto({ storage_path: 'req1/x.PNG' })], info({ req1: {} }));
    expect(daPath[0].zipPath).toBe('VIA ROMA 12/2409539_vecchio.png');

    const daNome = buildZipEntriesTaskVia(
      [foto({ storage_path: 'req1/senza-estensione', file_name: 'a_b.jpeg' })],
      info({ req1: {} }),
    );
    expect(daNome[0].zipPath).toBe('VIA ROMA 12/2409539_vecchio.jpeg');

    const fallback = buildZipEntriesTaskVia(
      [foto({ storage_path: 'req1/senza-estensione', file_name: 'senza' })],
      info({ req1: {} }),
    );
    expect(fallback[0].zipPath).toBe('VIA ROMA 12/2409539_vecchio.jpg');
  });

  it('preserva storage_path per il download', () => {
    const entries = buildZipEntriesTaskVia([foto({ storage_path: 'req1/x.jpg' })], info({ req1: {} }));
    expect(entries[0].storagePath).toBe('req1/x.jpg');
  });

  it('lista vuota → nessuna entry', () => {
    expect(buildZipEntriesTaskVia([], new Map())).toEqual([]);
  });
});
