import { describe, it, expect } from 'vitest';
import { daAssegnare, righeExportDaAssegnare } from './daAssegnare';
import type { RigaRichiesta } from './types';

const R = (o: Partial<RigaRichiesta>): RigaRichiesta => ({
  id: 'x', rapportino_id: null, voce_id: null, intervento_id: null,
  staff_id: 's1', staff_name: 'ROSSI MARIO', committente: 'acqualatina',
  data: '2026-07-30', stato: 'approvato', corsia: 'normale',
  dati_operatore: {}, dati_correnti: {}, note: null, motivo_rifiuto: null,
  created_at: '2026-07-30T08:00:00Z', assegnato_committente_at: null,
  ...o,
});

const conAnagrafica = (a: Record<string, string>, o: Partial<RigaRichiesta> = {}) =>
  R({ dati_correnti: { anagrafica: a }, ...o });

describe('daAssegnare', () => {
  it('approvata e non ancora registrata → da assegnare', () => {
    expect(daAssegnare(R({}))).toBe(true);
  });

  it('registrata sul committente → non più in coda', () => {
    expect(daAssegnare(R({ assegnato_committente_at: '2026-07-30T12:00:00Z' }))).toBe(false);
  });

  it('non approvata → fuori dalla coda, qualunque sia il timestamp', () => {
    expect(daAssegnare(R({ stato: 'in_attesa' }))).toBe(false);
    expect(daAssegnare(R({ stato: 'rifiutato' }))).toBe(false);
    // auto_liberi salta l'approvazione: l'intervento c'è già, ma NON è una riga approvata
    // dall'ufficio e non entra in questa coda finché non lo si decide esplicitamente.
    expect(daAssegnare(R({ stato: 'auto_liberi' }))).toBe(false);
  });

  // Senza questo filtro la coda nascerebbe con 2.521 righe storiche già approvate (misurato
  // sul prod: 2.140 lim_massive + 381 italgas), tutte con timestamp nullo perché la colonna
  // è nuova — e sarebbe inutilizzabile dal primo giorno.
  it('solo i committenti ad assegnazione manuale: su ACEA assegna l’agente, Italgas non ha portale', () => {
    expect(daAssegnare(R({ committente: 'lim_massive' }))).toBe(false);
    expect(daAssegnare(R({ committente: 'italgas' }))).toBe(false);
    expect(daAssegnare(R({ committente: 'acea' }))).toBe(false);
    expect(daAssegnare(R({ committente: 'altro' }))).toBe(false);
  });
});

describe('righeExportDaAssegnare', () => {
  it('porta ODL e operatore destinatario: è tutto ciò che serve per assegnare', () => {
    const out = righeExportDaAssegnare([
      conAnagrafica({ odl: '12379532', matricola: '140622', via: 'VIA ROMA 1', comune: 'TERRACINA' }),
    ]);
    expect(out).toEqual([{
      odl: '12379532', operatore: 'ROSSI MARIO', matricola: '140622',
      indirizzo: 'VIA ROMA 1', comune: 'TERRACINA', data: '2026-07-30', committente: 'acqualatina',
    }]);
  });

  it('`dati_correnti` comanda: è lo snapshot corretto in approvazione', () => {
    const out = righeExportDaAssegnare([R({
      dati_operatore: { anagrafica: { odl: 'SBAGLIATO', matricola: '111' } },
      dati_correnti: { anagrafica: { odl: '12379595', matricola: '140622' } },
    })]);
    expect(out[0].odl).toBe('12379595');
  });

  it('`dati_correnti` vuoto → si ripiega su `dati_operatore`', () => {
    const out = righeExportDaAssegnare([R({
      dati_operatore: { anagrafica: { odl: 'A1' } },
      dati_correnti: {},
    })]);
    expect(out[0].odl).toBe('A1');
  });

  it('ordina per operatore e poi per ODL, non per data', () => {
    // Chi assegna lavora un operatore alla volta sul portale del committente.
    const out = righeExportDaAssegnare([
      conAnagrafica({ odl: '900' }, { staff_name: 'VERDI ANNA', data: '2026-07-01' }),
      conAnagrafica({ odl: '100' }, { staff_name: 'ROSSI MARIO', data: '2026-07-30' }),
      conAnagrafica({ odl: '20' }, { staff_name: 'ROSSI MARIO', data: '2026-07-02' }),
    ]);
    expect(out.map((r) => `${r.operatore}/${r.odl}`)).toEqual([
      'ROSSI MARIO/20', 'ROSSI MARIO/100', 'VERDI ANNA/900',
    ]);
  });

  it('esclude le righe già registrate e quelle non approvate', () => {
    const out = righeExportDaAssegnare([
      conAnagrafica({ odl: 'OK' }),
      conAnagrafica({ odl: 'GIA' }, { assegnato_committente_at: '2026-07-30T12:00:00Z' }),
      conAnagrafica({ odl: 'ATTESA' }, { stato: 'in_attesa' }),
    ]);
    expect(out.map((r) => r.odl)).toEqual(['OK']);
  });

  it('anagrafica assente o malformata non rompe l export', () => {
    const out = righeExportDaAssegnare([R({ dati_correnti: { anagrafica: null }, dati_operatore: {} })]);
    expect(out).toEqual([{ odl: '', operatore: 'ROSSI MARIO', matricola: '', indirizzo: '', comune: '', data: '2026-07-30', committente: 'acqualatina' }]);
  });

  it('senza staff_name ripiega sullo staff_id: mai una riga senza destinatario', () => {
    const out = righeExportDaAssegnare([conAnagrafica({ odl: 'A' }, { staff_name: null })]);
    expect(out[0].operatore).toBe('s1');
  });
});
