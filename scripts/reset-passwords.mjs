import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://aceztqfebringeaebvce.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjZXp0cWZlYnJpbmdlYWVidmNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQyODQzMywiZXhwIjoyMDc2MDA0NDMzfQ.VTVpXLuDQ_RL3yG6aiKYm7sN45Q2tUmmpPPCgkKlG_E';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const NEW_PASSWORD = 'Plenzich@2027!';

const { data: { users }, error } = await supabase.auth.admin.listUsers();
if (error) { console.error('Errore lista utenti:', error); process.exit(1); }

const localUsers = users.filter(u => u.email?.endsWith('@local.it'));
console.log(`Trovati ${localUsers.length} utenti @local.it`);

for (const user of localUsers) {
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: NEW_PASSWORD
  });
  if (updateError) {
    console.error(`ERRORE ${user.email}:`, updateError.message);
  } else {
    console.log(`OK: ${user.email}`);
  }
}

console.log('\nDone! Prova login con password: Plenzich@2027!');
