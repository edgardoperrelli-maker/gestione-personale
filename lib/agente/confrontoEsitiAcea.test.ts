// Test del confronto esiti DB ↔ ACEA (classificazione 4 esiti, grigliata 20/07).
import { describe, it, expect } from 'vitest';
import {
  classificaPositivoDb,
  aceaPositiva,
  runIdUltimoGiro,
  confrontaEsiti,
  type SnapshotRow,
} from './confrontoEsitiAcea';

const snap = (over: Partial<SnapshotRow>): SnapshotRow => ({
  odl: 'X', stato_norm: 'COMPLETATO', causa_scostamento: 'EFRE', run_id: 'r1', raccolto_at: '2026-07-20T08:00:00Z', ...over,
});

describe('classificaPositivoDb', () => {
  it('COMPLETATO + causale E → ok', () => {
    expect(classificaPositivoDb(snap({}))).toBe('ok');
  });
  it('COMPLETATO + causale vuota → ok_causale_assente (niente fallback silenzioso)', () => {
    expect(classificaPositivoDb(snap({ causa_scostamento: '' }))).toBe('ok_causale_assente');
    expect(classificaPositivoDb(snap({ causa_scostamento: null }))).toBe('ok_causale_assente');
  });
  it('COMPLETATO + causale non-E → nostro_carico', () => {
    expect(classificaPositivoDb(snap({ causa_scostamento: 'NMNT' }))).toBe('nostro_carico');
  });
  it('stato diverso da COMPLETATO → non_consuntivato', () => {
    expect(classificaPositivoDb(snap({ stato_norm: 'ASSEGNATO' }))).toBe('non_consuntivato');
  });
  it('assente dallo snapshot → non_in_export', () => {
    expect(classificaPositivoDb(undefined)).toBe('non_in_export');
  });
});

describe('aceaPositiva', () => {
  it('positiva solo con COMPLETATO + causale E (vuota esclusa)', () => {
    expect(aceaPositiva(snap({}))).toBe(true);
    expect(aceaPositiva(snap({ causa_scostamento: '' }))).toBe(false);
    expect(aceaPositiva(snap({ causa_scostamento: 'NPRT' }))).toBe(false);
    expect(aceaPositiva(snap({ stato_norm: 'ASSEGNATO' }))).toBe(false);
  });
});

describe('runIdUltimoGiro', () => {
  it('prende il run della riga più recente', () => {
    const rows = [
      snap({ run_id: 'vecchio', raccolto_at: '2026-07-10T08:00:00Z' }),
      snap({ run_id: 'nuovo', raccolto_at: '2026-07-20T08:00:00Z' }),
    ];
    expect(runIdUltimoGiro(rows)).toBe('nuovo');
    expect(runIdUltimoGiro([])).toBeNull();
  });
});

describe('confrontaEsiti', () => {
  it('classifica la direzione DB→ACEA e ritorna solo le righe non allineate', () => {
    const r = confrontaEsiti({
      positiviDb: [
        { odl: 'A', data: '2026-07-01' },  // ok
        { odl: 'B', data: '2026-07-02' },  // nostro_carico
        { odl: 'C', data: '2026-07-03' },  // non_consuntivato
        { odl: 'D', data: '2026-07-04' },  // non_in_export
      ],
      snapshot: [
        snap({ odl: 'A' }),
        snap({ odl: 'B', causa_scostamento: 'NMNT' }),
        snap({ odl: 'C', stato_norm: 'ASSEGNATO' }),
      ],
      positiviDbTutti: new Set(['a', 'b', 'c', 'd']),
      odlConosciuti: new Set(['a', 'b', 'c', 'd']),
    });
    expect(r.dbVersoAcea.totale).toBe(4);
    expect(r.dbVersoAcea.conteggi).toMatchObject({ ok: 1, nostro_carico: 1, non_consuntivato: 1, non_in_export: 1 });
    expect(r.dbVersoAcea.righe.map((x) => x.odl).sort()).toEqual(['B', 'C', 'D']);
  });

  it('dedup per ODL nella direzione DB (voce SI + intervento positivo contano una volta)', () => {
    const r = confrontaEsiti({
      positiviDb: [{ odl: 'A', data: '2026-07-01' }, { odl: ' a ', data: '2026-06-01' }],
      snapshot: [snap({ odl: 'A' })],
      positiviDbTutti: new Set(['a']),
      odlConosciuti: new Set(['a']),
    });
    expect(r.dbVersoAcea.totale).toBe(1);
    expect(r.dbVersoAcea.conteggi.ok).toBe(1);
  });

  it('direzione ACEA→DB: separa ok / mancanti (lavorati) / mai visti', () => {
    const r = confrontaEsiti({
      positiviDb: [{ odl: 'A', data: '2026-07-01' }],
      snapshot: [
        snap({ odl: 'A' }),                       // ok: positivo anche da noi
        snap({ odl: 'B' }),                       // mancante: lavorato ma non positivo
        snap({ odl: 'C' }),                       // mai visto
        snap({ odl: 'D', causa_scostamento: 'NMNT' }), // non positiva ACEA → fuori
      ],
      positiviDbTutti: new Set(['a']),
      odlConosciuti: new Set(['a', 'b']),
    });
    expect(r.aceaVersoDb.ok).toBe(1);
    expect(r.aceaVersoDb.mancanti.map((x) => x.odl)).toEqual(['B']);
    expect(r.aceaVersoDb.maiVisti.map((x) => x.odl)).toEqual(['C']);
  });

  it('doppia conferma: la fonte del positivo DB viaggia fino alla riga', () => {
    const r = confrontaEsiti({
      positiviDb: [{ odl: 'B', data: '2026-07-02', fonte: 'voce' }],
      snapshot: [snap({ odl: 'B', stato_norm: 'ASSEGNATO' })],
      positiviDbTutti: new Set(['b']),
      odlConosciuti: new Set(['b']),
    });
    expect(r.dbVersoAcea.righe[0]).toMatchObject({ odl: 'B', fonte: 'voce', esito: 'non_consuntivato' });
  });

  it('la causale ACEA compare nelle righe della direzione ACEA→DB', () => {
    const r = confrontaEsiti({
      positiviDb: [],
      snapshot: [snap({ odl: 'B', causa_scostamento: ' EIES ' })],
      positiviDbTutti: new Set(),
      odlConosciuti: new Set(['b']),
    });
    expect(r.aceaVersoDb.mancanti[0]).toMatchObject({ odl: 'B', causa: 'EIES' });
  });

  it('ODL conosciuto ma FUORI ambito (massive) → contato in fuoriAmbito, non mancante né mai visto', () => {
    const r = confrontaEsiti({
      positiviDb: [],
      snapshot: [snap({ odl: 'MASSIVA' })],
      positiviDbTutti: new Set(),
      odlConosciuti: new Set(),
      odlFuoriAmbito: new Set(['massiva']),
    });
    expect(r.aceaVersoDb.fuoriAmbito).toBe(1);
    expect(r.aceaVersoDb.mancanti).toEqual([]);
    expect(r.aceaVersoDb.maiVisti).toEqual([]);
  });

  it('un positivo DB FUORI finestra non produce un falso "mancante" (positiviDbTutti)', () => {
    const r = confrontaEsiti({
      positiviDb: [],                              // finestra: nessun positivo recente
      snapshot: [snap({ odl: 'VECCHIO' })],
      positiviDbTutti: new Set(['vecchio']),       // ma storicamente è positivo anche da noi
      odlConosciuti: new Set(['vecchio']),
    });
    expect(r.aceaVersoDb.ok).toBe(1);
    expect(r.aceaVersoDb.mancanti).toEqual([]);
  });

  it('la direzione ACEA→DB usa solo le righe dell\'ULTIMO giro', () => {
    const r = confrontaEsiti({
      positiviDb: [],
      snapshot: [
        snap({ odl: 'STALE', run_id: 'vecchio', raccolto_at: '2026-07-01T08:00:00Z' }),
        snap({ odl: 'FRESCA', run_id: 'nuovo', raccolto_at: '2026-07-20T08:00:00Z' }),
      ],
      positiviDbTutti: new Set(),
      odlConosciuti: new Set(),
    });
    expect(r.aceaVersoDb.totale).toBe(1);
    expect(r.aceaVersoDb.maiVisti.map((x) => x.odl)).toEqual(['FRESCA']);
  });
});
