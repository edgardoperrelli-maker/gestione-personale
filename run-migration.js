#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migration = `
alter table public.staff
  add column if not exists home_address text,
  add column if not exists home_cap     text,
  add column if not exists home_city    text,
  add column if not exists home_lat     double precision,
  add column if not exists home_lng     double precision;
`;

async function runMigration() {
  try {
    console.log('🚀 Running migration: add home_* columns to staff table...');

    const { error } = await supabase.rpc('exec_sql', { sql: migration }).catch(() => {
      // Se exec_sql non esiste, prova con un query diretto
      return supabase.from('staff').select('id').limit(1);
    });

    // Prova alternativa: usa il client per eseguire il raw SQL
    const { data, error: rawError } = await supabase.rpc('exec_sql', { sql: migration });

    if (rawError) {
      console.log('⚠️  exec_sql not available, trying alternative method...');
      // Il metodo diretto non funziona, istruzioni per l'utente
      console.log('\n📋 Please run this SQL manually in Supabase dashboard:\n');
      console.log(migration);
      return;
    }

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.log('\n📋 Please run this SQL manually in Supabase dashboard:\n');
    console.log(migration);
  }
}

runMigration();
