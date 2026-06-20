// tools/limitazioni-sync/lib/acea/lock.mjs
// I/O: lock file per impedire due giri ACEA in parallelo (tick frequenti).
import fs from 'node:fs';

/** Acquisisce il lock. False se ne esiste uno scritto da meno di staleMs. */
export function acquisisci(lockPath, { nowMs = Date.now(), staleMs = 10 * 60 * 1000 } = {}) {
  try {
    const { ms } = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (typeof ms === 'number' && nowMs - ms < staleMs) return false; // giro attivo
  } catch { /* assente o illeggibile → procedi */ }
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ms: nowMs }), 'utf8');
  return true;
}

/** Rilascia il lock (idempotente). */
export function rilascia(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* già assente */ }
}
