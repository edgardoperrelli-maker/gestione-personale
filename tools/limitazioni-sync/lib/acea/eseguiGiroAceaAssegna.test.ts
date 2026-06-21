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

  it('lock occupato → saltato', async () => {
    const { cfg } = cfgConDir();
    fs.writeFileSync(path.join(path.dirname(cfg.acea.masterPath), 'acea.lock'), JSON.stringify({ pid: 1, ms: 1000 }));
    const rep = await eseguiGiroAceaAssegna({ cfg, stamp: 's', data: '2026-06-22', dryRun: true, nowMs: 1500, fetchLista: async () => ({ righe: [] }), assegna: async () => ({ esiti: [] }) });
    expect(rep.saltato).toBe(true);
  });
});
