import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eseguiGiroAceaAssegna } from './eseguiGiroAceaAssegna.mjs';

function cfgConDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acea-assegna-'));
  return { cfg: { acea: { masterPath: path.join(dir, 'm.xlsx'), operatori: { 'ROSSI Mario': 'ROSSI MARIO' } } }, dir };
}

describe('eseguiGiroAceaAssegna', () => {
  it('mappa il nome operatore e riporta gli esiti', async () => {
    const { cfg } = cfgConDir();
    const fetchLista = async () => ({ data: '2026-06-22', righe: [{ odl: '111', matricola: 'M1', comune: 'ROMA', staffId: 's1', operatoreAcea: 'ROSSI Mario', interventoId: 'i1' }], scartati: [] });
    let nomeVisto = '';
    const assegna = async (_acea, righe) => { nomeVisto = righe[0].operatoreAcea; return { esiti: [{ odl: '111', esito: 'assegnato' }] }; };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: false, nowMs: 1000, fetchLista, assegna });
    expect(nomeVisto).toBe('ROSSI MARIO'); // override applicato
    expect(rep.tipo).toBe('acea-assegna');
    expect(rep.righe).toHaveLength(1);
    expect(rep.righe[0]).toMatchObject({ odl: '111', esito: 'assegnato', operatoreAcea: 'ROSSI MARIO', interventoId: 'i1' });
    expect(rep.file[0].aggiornate).toBe(1);
  });

  it('lista vuota → nessuna chiamata ad assegna', async () => {
    const { cfg } = cfgConDir();
    const fetchLista = async () => ({ data: '2026-06-22', righe: [], scartati: [{ odl: '9', motivo: 'già assegnato' }] });
    let chiamato = false;
    const assegna = async () => { chiamato = true; return { esiti: [] }; };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: true, nowMs: 1000, fetchLista, assegna });
    expect(chiamato).toBe(false);
    expect(rep.righe).toHaveLength(0);
    expect(rep.scartati).toHaveLength(1);
  });

  it('salta gli ODL già assegnati alla risorsa giusta (esito gia-assegnato; assegna riceve solo i residui)', async () => {
    const { cfg } = cfgConDir();
    cfg.acea.export = { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione', colonnaOperatore: 'Cognome C.I.D.' };
    const fetchLista = async () => ({ data: '2026-06-27', righe: [
      { odl: '111', operatoreAcea: 'ROSSI Mario', matricola: 'M1', comune: 'ROMA', interventoId: 'i1' },
      { odl: '222', operatoreAcea: 'ROSSI Mario', matricola: 'M2', comune: 'ROMA', interventoId: 'i2' },
    ], scartati: [] });
    // export: 111 già assegnato a ROSSI (giusto), 222 a BIANCHI (sbagliato → va riassegnato)
    const scaricaExport = async () => 'fake.xlsx';
    const leggiExport = async () => ({ righe: [
      { ordine: '111', stato: 'x', operatore: 'ROSSI MARIO' },
      { ordine: '222', stato: 'x', operatore: 'BIANCHI' },
    ], erroreColonne: false });
    let ricevuti: string[] = [];
    const assegna = async (_a: unknown, righe: { odl: string }[]) => {
      ricevuti = righe.map((r) => r.odl);
      return { esiti: righe.map((r) => ({ odl: r.odl, esito: 'assegnato' })) };
    };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-27', dryRun: false, nowMs: 1000, fetchLista, assegna, scaricaExport, leggiExport });
    expect(ricevuti).toEqual(['222']); // solo il residuo va al driver
    expect(rep.righe.find((r: { odl: string }) => r.odl === '111')?.esito).toBe('gia-assegnato');
    expect(rep.righe.find((r: { odl: string }) => r.odl === '222')?.esito).toBe('assegnato');
    expect(rep.file[0].aggiornate).toBe(2); // gia-assegnato + assegnato contano entrambi OK
  });

  it('export non leggibile → fail-soft: assegna riceve tutti (comportamento odierno)', async () => {
    const { cfg } = cfgConDir();
    cfg.acea.export = { colonnaOdl: 'Ordine', colonnaStato: 'Stato Operazione', colonnaOperatore: 'Cognome C.I.D.' };
    const fetchLista = async () => ({ data: '2026-06-27', righe: [{ odl: '111', operatoreAcea: 'ROSSI Mario' }], scartati: [] });
    const scaricaExport = async () => { throw new Error('login fallito'); };
    let chiamato = false;
    const assegna = async (_a: unknown, righe: { odl: string }[]) => { chiamato = true; return { esiti: righe.map((r) => ({ odl: r.odl, esito: 'assegnato' })) }; };
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-27', dryRun: false, nowMs: 1000, fetchLista, assegna, scaricaExport, leggiExport: async () => ({ righe: [] }) });
    expect(chiamato).toBe(true);
    expect(rep.righe[0].esito).toBe('assegnato');
  });

  it('lock occupato → saltato', async () => {
    const { cfg } = cfgConDir();
    fs.writeFileSync(path.join(path.dirname(cfg.acea.masterPath), 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: true, nowMs: 1500, fetchLista: async () => ({ righe: [] }), assegna: async () => ({ esiti: [] }) });
    expect(rep.saltato).toBe(true);
  });
});
