/**
 * Import civici Napoli da CSV ANNCSU in Supabase
 *
 * Uso:
 * node scripts/import-civici-napoli.mjs <territorio_id>
 * oppure imposta SOPRALLUOGHI_TERRITORY_ID nell'ambiente
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TERRITORY_ID = process.argv[2] ?? process.env.SOPRALLUOGHI_TERRITORY_ID ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Env vars mancanti: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!TERRITORY_ID) {
  console.error('Territorio mancante: passa <territorio_id> oppure imposta SOPRALLUOGHI_TERRITORY_ID');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CSV_PATH = path.join(__dirname, '../public/data/napoli_civici_microaree.csv');

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const header = lines[0].split(';');

  const records = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const values = line.split(';');
    const record = {};

    header.forEach((key, headerIndex) => {
      record[key.trim()] = values[headerIndex]?.trim() || null;
    });

    records.push(record);
  }

  return records;
}

function toDatabaseRow(row) {
  return {
    territorio_id: TERRITORY_ID,
    odonimo: row.odonimo || '',
    civico: row.civico || '',
    microarea: row.microarea || '',
    latitudine: row.latitudine ? parseFloat(row.latitudine.replace(',', '.')) : null,
    longitudine: row.longitudine ? parseFloat(row.longitudine.replace(',', '.')) : null,
  };
}

async function insertBatch(rows, batchNum, totalBatches) {
  const { error } = await supabase
    .from('civici_napoli')
    .upsert(rows, {
      onConflict: 'territorio_id,odonimo,civico,microarea',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`Batch ${batchNum}/${totalBatches} fallito:`, error.message);
    return false;
  }

  console.log(`Batch ${batchNum}/${totalBatches} - ${rows.length} righe inserite`);
  return true;
}

async function main() {
  console.log(`Import civici Napoli in Supabase per territorio ${TERRITORY_ID}...\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File non trovato: ${CSV_PATH}`);
    console.log('Copia il file napoli_civici_microaree.csv in public/data/');
    process.exit(1);
  }

  console.log('Lettura CSV...');
  const rows = parseCsv(CSV_PATH);
  console.log(`Trovate ${rows.length.toLocaleString()} righe\n`);

  const dbRows = rows.map(toDatabaseRow);
  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(dbRows.length / BATCH_SIZE);

  console.log(`Inizio import in ${totalBatches} batch...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let index = 0; index < dbRows.length; index += BATCH_SIZE) {
    const batch = dbRows.slice(index, index + BATCH_SIZE);
    const batchNum = Math.floor(index / BATCH_SIZE) + 1;

    const success = await insertBatch(batch, batchNum, totalBatches);
    if (success) {
      successCount += batch.length;
    } else {
      errorCount += batch.length;
    }

    if (index + BATCH_SIZE < dbRows.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log('\n--------------------------------');
  console.log('Import completato');
  console.log(`Successi: ${successCount.toLocaleString()}`);
  console.log(`Errori:   ${errorCount.toLocaleString()}`);

  const { count, error } = await supabase
    .from('civici_napoli')
    .select('*', { count: 'exact', head: true })
    .eq('territorio_id', TERRITORY_ID);

  if (!error) {
    console.log(`Totale in DB per territorio: ${count?.toLocaleString() || 0}`);
  }
}

main().catch((error) => {
  console.error('Errore:', error);
  process.exit(1);
});
