// tools/limitazioni-sync/lib/sincronizzazioneWatch.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error — modulo .mjs senza tipi
import { verificaModificaEsterna, registraScrittura } from './sincronizzazioneWatch.mjs';

let dir: string;
let master: string;
let statePath: string;

function scriviMaster(bytes: number, mtimeMs?: number) {
  fs.writeFileSync(master, Buffer.alloc(bytes, 1));
  if (mtimeMs != null) {
    const t = mtimeMs / 1000;
    fs.utimesSync(master, t, t);
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-'));
  master = path.join(dir, 'ZAGAROLO.xlsx');
  statePath = path.join(dir, '.sync-watch.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('registraScrittura', () => {
  it('crea il file di stato con mtime e size del master appena scritto', () => {
    scriviMaster(1000);
    registraScrittura(master, { statePath, nowIso: '2026-07-14T18:00:00.000Z' });

    const stato = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(stato[master]).toBeTruthy();
    expect(stato[master].size).toBe(1000);
    expect(typeof stato[master].mtimeMs).toBe('number');
    expect(stato[master].stamp).toBe('2026-07-14T18:00:00.000Z');
  });

  it('è best-effort: se il master non esiste non lancia e non scrive stato', () => {
    expect(() => registraScrittura(master, { statePath })).not.toThrow();
    expect(fs.existsSync(statePath)).toBe(false);
  });
});

describe('verificaModificaEsterna', () => {
  it('senza baseline (primo giro) ritorna null', () => {
    scriviMaster(1000);
    expect(verificaModificaEsterna(master, { statePath })).toBeNull();
  });

  it('se il file è invariato dalla scrittura dell agente ritorna null', () => {
    scriviMaster(1000, 1_000_000_500); // mtime frazionario (.500)
    registraScrittura(master, { statePath });
    // stessa identica versione su disco → nessuna modifica esterna
    expect(verificaModificaEsterna(master, { statePath })).toBeNull();
  });

  it('rileva la sovrascrittura: il file è cambiato dopo l ultima scrittura dell agente', () => {
    scriviMaster(1000, 1_000_000_500); // versione agente (mtime .500)
    registraScrittura(master, { statePath });
    // simula il clobber del server: contenuto/size/mtime diversi
    scriviMaster(2000, 1_000_500_000);
    const avviso = verificaModificaEsterna(master, { statePath });
    expect(avviso).not.toBeNull();
    expect(avviso!.precedente.size).toBe(1000);
    expect(avviso!.attuale.size).toBe(2000);
  });

  it('marca probabileServer quando il nuovo mtime cade su un secondo intero (.000)', () => {
    scriviMaster(1000, 1_000_000_500); // agente: frazionario
    registraScrittura(master, { statePath });
    scriviMaster(2000, 1_000_500_000); // server: secondo intero → .000
    const avviso = verificaModificaEsterna(master, { statePath });
    expect(avviso!.probabileServer).toBe(true);
  });

  it('NON marca probabileServer quando il nuovo mtime è frazionario (edit locale)', () => {
    scriviMaster(1000, 1_000_000_500);
    registraScrittura(master, { statePath });
    scriviMaster(2000, 1_000_500_250); // frazionario (.250)
    const avviso = verificaModificaEsterna(master, { statePath });
    expect(avviso!.probabileServer).toBe(false);
  });
});
