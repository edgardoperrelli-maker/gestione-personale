// tools/limitazioni-sync/scriviLog.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { scriviLog } from './agente.mjs';

describe('scriviLog', () => {
  it('cartella master esistente: log in <cartella>/_log/<stamp>.json', () => {
    const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-log-'));
    scriviLog(cartella, '20260720-1500', { ok: true });

    const atteso = path.join(cartella, '_log', '20260720-1500.json');
    expect(fs.existsSync(atteso)).toBe(true);
    expect(JSON.parse(fs.readFileSync(atteso, 'utf8'))).toEqual({ ok: true });
  });

  it('cartella master INESISTENTE: log nel fallback locale e NON ricrea l\'albero remoto', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-log-'));
    const cartella = path.join(base, 'COMMESSA SPARITA', '8_LAVORI', 'LIMITAZIONI MASSIVE');
    const fallbackDir = path.join(base, 'fallback-log');

    scriviLog(cartella, '20260720-1501', { erroreGlobale: 'Cartella non trovata' }, { fallbackDir });

    // il log c'è, ma nel fallback locale…
    const atteso = path.join(fallbackDir, '20260720-1501.json');
    expect(fs.existsSync(atteso)).toBe(true);
    // …e l'albero della cartella sparita NON è stato ricreato (niente fantasmi su OneDrive)
    expect(fs.existsSync(cartella)).toBe(false);
    expect(fs.existsSync(path.join(base, 'COMMESSA SPARITA'))).toBe(false);
  });
});
