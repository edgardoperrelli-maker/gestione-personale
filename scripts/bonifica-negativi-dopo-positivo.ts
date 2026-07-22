// Bonifica una-tantum: le chiusure NEGATIVE registrate su ODL già positivi altrove
// (da_riconciliare=true, stato='completato') diventano ANNULLATE con motivo esplicito e
// spariscono dal banner di riconciliazione — la visita non era dovuta, il positivo originale
// resta l'unico esito valido. I doppioni POSITIVI (stato='annullato') non si toccano.
// Idempotente: le righe già annullate non rientrano nel filtro.
// Uso: npx tsx scripts/bonifica-negativi-dopo-positivo.ts          (anteprima, nessuna scrittura)
//      npx tsx scripts/bonifica-negativi-dopo-positivo.ts --apply  (applica)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dataIt } from '../lib/interventi/odlPositivi';

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
  const apply = process.argv.includes('--apply');

  const { data: righe, error } = await db
    .from('interventi')
    .select('id, odl, data, staff_id, riconciliazione_rif_id')
    .eq('da_riconciliare', true)
    .eq('stato', 'completato')
    .not('riconciliazione_rif_id', 'is', null);
  if (error) { console.error(`Query fallita: ${error.message}`); process.exit(1); }
  const pendenti = (righe ?? []) as Array<{ id: string; odl: string | null; data: string | null; riconciliazione_rif_id: string }>;
  console.log(`Negativi-dopo-positivo pendenti: ${pendenti.length}${apply ? '' : ' (ANTEPRIMA: rilancia con --apply per scrivere)'}`);
  if (pendenti.length === 0) return;

  const rifIds = [...new Set(pendenti.map((r) => r.riconciliazione_rif_id))];
  const { data: originali } = await db.from('interventi').select('id, data').in('id', rifIds);
  const dataByRif = new Map(((originali ?? []) as Array<{ id: string; data: string | null }>).map((o) => [o.id, o.data]));

  let ok = 0, errori = 0;
  for (const r of pendenti) {
    const dataOrig = dataByRif.get(r.riconciliazione_rif_id) ?? null;
    const motivo = `ODL già positivo il ${dataIt(dataOrig)} — visita non dovuta (bonifica)`;
    console.log(`  ${r.odl ?? '—'} (${r.data ?? '—'}) → annullato: ${motivo}`);
    if (!apply) continue;
    const { error: eUpd } = await db
      .from('interventi')
      .update({ stato: 'annullato', esito: null, esito_motivo: motivo, da_riconciliare: false })
      .eq('id', r.id)
      .eq('stato', 'completato'); // guardia: non tocca righe cambiate nel frattempo
    if (eUpd) { console.error(`    ERRORE ${r.id}: ${eUpd.message}`); errori++; } else ok++;
  }
  if (apply) console.log(`Annullati: ${ok}, errori: ${errori}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
