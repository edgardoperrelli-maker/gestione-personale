// lib/interventi/sweepOdlPositivo.test.ts
// PURA pianificaSweep: un positivo appena registrato revoca voci non compilate e interventi
// ancora aperti con lo stesso ODL altrove — mai il lavoro registrato né i rapportini inviati.
import { describe, it, expect } from 'vitest';
import { pianificaSweep, type VoceSweep } from './sweepOdlPositivo';
import { dettagliOdlBloccati, labelOdlBloccato } from './odlPositivi';

const positivo = { id: 'pos1', odl: 'ODL1', committente: 'acea', esito: 'eseguito_positivo' };
const voce = (over: Partial<VoceSweep>): VoceSweep => ({
  id: 'v1', intervento_id: 'c1', odl: 'ODL1', risposte: {}, manuale: false, rapportinoStato: 'in_corso', ...over,
});

describe('pianificaSweep', () => {
  it('revoca voce non compilata + intervento aperto con lo stesso ODL', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
      voci: [voce({})],
    });
    expect(piano.vociDaEliminare).toEqual(['v1']);
    expect(piano.interventiDaEliminare).toEqual(['c1']);
  });

  it('una voce COMPILATA non si tocca e protegge il suo intervento (backstop all\'invio)', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
      voci: [voce({ risposte: { eseguito: 'NESSUN PASSAGGIO' } })],
    });
    expect(piano.vociDaEliminare).toEqual([]);
    expect(piano.interventiDaEliminare).toEqual([]);
  });

  it('voci manuali e rapportini INVIATI sono intoccabili', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
      voci: [
        voce({ id: 'vM', manuale: true }),
        voce({ id: 'vI', rapportinoStato: 'inviato' }),
      ],
    });
    expect(piano.vociDaEliminare).toEqual([]);
    expect(piano.interventiDaEliminare).toEqual([]); // entrambe proteggono c1
  });

  it('non tocca interventi terminali né il positivo stesso; senza voce l\'intervento aperto cade', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [
        { id: 'pos1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }, // il positivo stesso
        { id: 'cDone', odl: 'ODL1', committente: 'acea', stato: 'completato' },
        { id: 'cNull', odl: 'ODL1', committente: 'acea', stato: 'annullato' },
        { id: 'cOpen', odl: 'ODL1', committente: 'acea', stato: 'da_assegnare' },
      ],
      voci: [],
    });
    expect(piano.interventiDaEliminare).toEqual(['cOpen']);
  });

  it('committente equivalente: un positivo lim_massive revoca il candidato acea (e viceversa)', () => {
    const piano = pianificaSweep({
      positivi: [{ ...positivo, committente: 'lim_massive' }],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
      voci: [voce({})],
    });
    expect(piano.interventiDaEliminare).toEqual(['c1']);
  });

  it('committente DIVERSO (italgas) non viene toccato', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'italgas', stato: 'assegnato' }],
      voci: [],
    });
    expect(piano.interventiDaEliminare).toEqual([]);
  });

  it('voce scollegata (intervento_id null) con lo stesso ODL viene eliminata', () => {
    const piano = pianificaSweep({
      positivi: [positivo],
      candidati: [],
      voci: [voce({ intervento_id: null })],
    });
    expect(piano.vociDaEliminare).toEqual(['v1']);
  });

  it('ODL normalizzato: " odl1 " matcha ODL1', () => {
    const piano = pianificaSweep({
      positivi: [{ ...positivo, odl: ' odl1 ' }],
      candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
      voci: [],
    });
    expect(piano.interventiDaEliminare).toEqual(['c1']);
  });

  it('esito non positivo o ODL vuoto → nessuna revoca', () => {
    for (const p of [
      { ...positivo, esito: null },
      { ...positivo, esito: 'eseguito_negativo' },
      { ...positivo, odl: '' },
      { ...positivo, odl: null },
    ]) {
      const piano = pianificaSweep({
        positivi: [p],
        candidati: [{ id: 'c1', odl: 'ODL1', committente: 'acea', stato: 'assegnato' }],
        voci: [voce({})],
      });
      expect(piano.vociDaEliminare).toEqual([]);
      expect(piano.interventiDaEliminare).toEqual([]);
    }
  });
});

describe('dettagliOdlBloccati / labelOdlBloccato', () => {
  it('arricchisce gli odl bloccati con data ed esecutore del positivo (dedup per normOdl)', () => {
    const info = new Map([['odl1', { data: '2026-07-21', esecutore: 'CIARALLO SIMONE' }]]);
    const dettagli = dettagliOdlBloccati(['ODL1', ' odl1 ', 'ODL2'], info);
    expect(dettagli).toEqual([
      { odl: 'ODL1', data: '2026-07-21', esecutore: 'CIARALLO SIMONE' },
      { odl: 'ODL2', data: null, esecutore: null },
    ]);
    expect(labelOdlBloccato(dettagli[0])).toBe('ODL1 → già positivo il 21/07/2026 (CIARALLO SIMONE)');
    expect(labelOdlBloccato(dettagli[1])).toBe('ODL2 → già positivo');
  });
});
