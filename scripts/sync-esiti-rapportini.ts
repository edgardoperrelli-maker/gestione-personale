// Propaga gli esiti dei rapportini INVIATI agli interventi (collega voci↔interventi per odl
// e applica Fatto/Non fatto). WRITE idempotente. Uso: npx tsx scripts/sync-esiti-rapportini.ts [YYYY-MM-DD]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { esitoInterventoDaVoce } from '../lib/interventi/esitoDaVoce';

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

  const data = process.argv[2] || new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
  const { data: raps, error: eRaps } = await db
    .from('rapportini')
    .select('id, staff_id, staff_name, campi_snapshot')
    .eq('data', data)
    .eq('stato', 'inviato');
  if (eRaps) { console.error(`Query rapportini fallita: ${eRaps.message}`); process.exit(1); }
  console.log(`Rapportini inviati ${data}: ${raps?.length ?? 0}`);
  let erroriTot = 0;

  for (const r of (raps ?? []) as Array<{ id: string; staff_id: string; staff_name: string | null; campi_snapshot: unknown }>) {
    const campi = (r.campi_snapshot ?? []) as Parameters<typeof esitoInterventoDaVoce>[1];
    const { data: voci } = await db.from('rapportino_voci').select('id, odsin, risposte, intervento_id').eq('rapportino_id', r.id);
    const { data: ints } = await db.from('interventi').select('id, odl, stato').eq('data', data).eq('staff_id', r.staff_id);
    const byOdl = new Map<string, { id: string; stato: string }>();
    for (const i of (ints ?? []) as Array<{ id: string; odl: string | null; stato: string }>) {
      const k = (i.odl ?? '').trim();
      if (k) byOdl.set(k, { id: i.id, stato: i.stato });
    }
    let linkati = 0, fatti = 0, nonFatti = 0, neutri = 0, nomatch = 0;
    for (const v of (voci ?? []) as Array<{ id: string; odsin: string | null; risposte: Record<string, unknown> | null; intervento_id: string | null }>) {
      const k = (v.odsin ?? '').trim();
      const it = k ? byOdl.get(k) : undefined;
      if (!it) { nomatch++; continue; }
      if (v.intervento_id !== it.id) {
        const { error: eLink } = await db.from('rapportino_voci').update({ intervento_id: it.id }).eq('id', v.id);
        if (eLink) { console.error(`    link voce ${v.id}: ${eLink.message}`); erroriTot++; } else linkati++;
      }
      if (it.stato === 'annullato' || it.stato === 'completato') continue;
      const patch = esitoInterventoDaVoce(v.risposte ?? {}, campi);
      if (!patch) { neutri++; continue; }
      const { error: eUpd } = await db.from('interventi')
        .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: new Date().toISOString() })
        .eq('id', it.id);
      if (eUpd) { console.error(`    update intervento ${it.id}: ${eUpd.message}`); erroriTot++; continue; }
      if (patch.esito === 'eseguito_positivo') fatti++; else nonFatti++;
    }
    console.log(`  ${r.staff_name}: link+${linkati} fatti=${fatti} nonFatti=${nonFatti} neutri=${neutri} nomatch=${nomatch}`);
  }
  if (erroriTot > 0) { console.error(`\nATTENZIONE: ${erroriTot} scritture fallite — i conteggi sopra potrebbero essere incompleti.`); process.exitCode = 1; }
  console.log('Sync completato.');
}

main();
