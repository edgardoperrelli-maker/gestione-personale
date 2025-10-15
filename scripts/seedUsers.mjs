// scripts/seedUsers.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Mancano env: NEXT_PUBLIC_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const USERS = [
  { username: 'Edgardo.Perrelli',     password: 'Plenzich@2026!', role: 'admin'  },
  { username: 'Mara.Boccia',          password: 'Plenzich@25',    role: 'editor' },
  { username: 'Francesco.Desantis',   password: 'Plenzich@25',    role: 'editor' },
  { username: 'Lorenzo.Alessandrini', password: 'Plenzich@25',    role: 'editor' },
  { username: 'Christian.Arragoni',   password: 'Plenzich@25',    role: 'editor' },
  { username: 'tecnico.pdr',          password: 'Plenzich@25',    role: 'viewer' },
];

async function findUserIdByEmail(email) {
  let page = 1, perPage = 1000;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

async function upsertProfile(userId, username, role) {
  const { error } = await sb.from('profiles').upsert({ id: userId, username, role });
  if (error) throw new Error(`profiles upsert ${username}: ${error.message}`);
}

async function logAudit(actor, action, entity, entityId, payload) {
  const { error } = await sb.rpc('log_audit', {
    p_actor: actor, p_action: action, p_entity: entity, p_entity_id: entityId, p_payload: payload
  });
  if (error) throw new Error(`audit ${action}/${entityId}: ${error.message}`);
}

async function createOrAttachUser(u) {
  const email = `u_${u.username}@local`;
  const { data, error } = await sb.auth.admin.createUser({
    email, password: u.password, email_confirm: true
  });

  let userId = null;
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || error.status === 422 || error.status === 400) {
      userId = await findUserIdByEmail(email);
      if (!userId) throw new Error(`utente esistente ma non trovato: ${email}`);
      console.log(`Esistente: ${u.username} -> ${email}`);
    } else {
      throw new Error(`createUser ${u.username}: ${error.message}`);
    }
  } else {
    if (!data?.user?.id) throw new Error(`createUser ${u.username}: nessun user.id`);
    userId = data.user.id;
    console.log(`Creato: ${u.username} -> ${email}`);
  }

  await upsertProfile(userId, u.username, u.role);
  await logAudit(userId, 'admin_seed_user', 'profiles', userId, { username: u.username, role: u.role });
}

(async () => {
  try {
    for (const u of USERS) await createOrAttachUser(u);
    console.log('Seed completo.');
    process.exit(0);
  } catch (e) {
    console.error('Seed fallito:', e?.message || e);
    process.exit(1);
  }
})();
