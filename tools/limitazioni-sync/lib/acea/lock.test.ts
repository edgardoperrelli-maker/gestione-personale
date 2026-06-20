// tools/limitazioni-sync/lib/acea/lock.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquisisci, rilascia } from './lock.mjs';

const lockPath = path.join(os.tmpdir(), `acea-test-${process.pid}.lock`);
afterEach(() => { try { fs.unlinkSync(lockPath); } catch { /* noop */ } });

describe('lock', () => {
  it('acquisisce su file assente e scrive il lock', () => {
    expect(acquisisci(lockPath, { nowMs: 1000 })).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
  });
  it('rifiuta se un lock recente è attivo', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    expect(acquisisci(lockPath, { nowMs: 2000, staleMs: 600000 })).toBe(false);
  });
  it('acquisisce se il lock è stale (oltre staleMs)', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    expect(acquisisci(lockPath, { nowMs: 1000 + 700000, staleMs: 600000 })).toBe(true);
  });
  it('rilascia rimuove il file (idempotente)', () => {
    acquisisci(lockPath, { nowMs: 1000 });
    rilascia(lockPath);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(() => rilascia(lockPath)).not.toThrow();
  });
});
