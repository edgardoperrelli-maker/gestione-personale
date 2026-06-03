// Backfill interventi dei piani esistenti. READ+WRITE idempotente.
// Uso: npx tsx scripts/backfill-interventi.ts [fromDateYYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ensureInterventiForPiano } from '../lib/interventi/ensureInterventiForPiano';

function loadEnv() {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* ignore */ }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Mancano env Supabase'); process.exit(1); }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const fromDate = process.argv[2] || new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
  const { data: piani } = await db
    .from('mappa_piani')
    .select('id, data, territorio')
    .gte('data', fromDate)
    .order('data', { ascending: true });

  console.log(`Piani con data >= ${fromDate}: ${piani?.length ?? 0}`);
  for (const p of (piani ?? []) as Array<{ id: string; data: string; territorio: string | null }>) {
    const r = await ensureInterventiForPiano(db, p.id);
    console.log(
      `piano ${p.id.slice(0, 8)} ${p.data} "${p.territorio}" -> creati=${r.creati} preservati=${r.preservati} scartati=${r.scartati}` +
        (r.error ? ` ERR=${r.error}` : ''),
    );
  }
  console.log('Backfill completato.');
}

main();
