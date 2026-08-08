// Crea (o riallinea) l'account demo da consegnare ad Apple App Review.
//
// Contesto: la submission è stata respinta con Guideline 5.6 — «features that
// appear to have been intentionally hidden during the review process». La causa
// è che il revisore trova un muro di login e non esiste registrazione pubblica:
// serve un'utenza che mostri OGNI modulo, senza sorprese al primo accesso.
//
// Uso:
//   npx tsx scripts/crea-account-demo-apple.ts <username> <password>
//   npx tsx scripts/crea-account-demo-apple.ts <username>     ← solo riallineo
//   DEMO_USERNAME=... DEMO_PASSWORD=... npx tsx scripts/crea-account-demo-apple.ts
//
// La password NON è nel file di proposito: questo script finisce in git, le
// credenziali che consegni ad Apple no.
//
// Omettendo la password su un'utenza che esiste già se ne riallineano SOLO
// ruolo, moduli e flag, lasciando intatte le credenziali: serve quando Apple ha
// già in mano un accesso e va solo promosso a visibilità totale.
//
// Idempotente: rilanciandolo su un'utenza esistente ne riallinea password,
// ruolo, moduli e flag senza duplicarla.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ALL_MODULE_KEYS, normalizeAllowedModules, toStoredProfileRole } from '../lib/moduleAccess';
import { normalizeUsername, toEmail } from '../lib/auth/usernameFromEmail';

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

function creaClient(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Derivato dalla factory, non da `typeof createClient`: senza argomenti di tipo
// quest'ultimo risolve ai generici di default, che non combaciano col client reale.
type Sb = ReturnType<typeof creaClient>;

/** L'admin API non espone una lookup per email: si pagina finché non si trova. */
async function findUserIdByEmail(sb: Sb, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Mancano NEXT_PUBLIC_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY (.env.local o env).');
    process.exit(1);
  }

  const username = normalizeUsername(process.argv[2] ?? process.env.DEMO_USERNAME ?? '');
  const password = (process.argv[3] ?? process.env.DEMO_PASSWORD ?? '').trim();

  if (!username) {
    console.error('Username mancante. Uso: npx tsx scripts/crea-account-demo-apple.ts <username> [password]');
    process.exit(1);
  }
  if (password && password.length < 8) {
    console.error('Password troppo corta: minimo 8 caratteri (Apple la digita a mano, evita simboli esotici).');
    process.exit(1);
  }

  const email = toEmail(username);
  const role = 'admin' as const;
  // Ruolo admin, non admin_plus: il revisore deve VEDERE tutto, non poter creare
  // o cancellare utenze reali. I moduli requiresAdminRole entrano comunque.
  const allowedModules = normalizeAllowedModules(ALL_MODULE_KEYS, role);

  const appMetadata = {
    role,
    allowedModules,
    modificaInterventi: true,
    // Decisivo: con questo a true il login si ferma sullo step di cambio password
    // e il revisore vedrebbe di nuovo un muro — esattamente ciò che ci è costato
    // il rigetto. Va tenuto esplicitamente a false.
    must_change_password: false,
  };

  const sb = creaClient(url, key);

  // Lookup prima della creazione: senza password l'unico esito legittimo è il
  // riallineo di un'utenza che esiste già.
  let userId = await findUserIdByEmail(sb, email);

  if (userId) {
    const updates: { password?: string; app_metadata: typeof appMetadata } = { app_metadata: appMetadata };
    if (password) updates.password = password;

    const { error: updErr } = await sb.auth.admin.updateUserById(userId, updates);
    if (updErr) throw new Error(`updateUserById: ${updErr.message}`);
    console.log(
      password
        ? `Riallineata utenza esistente (password aggiornata): ${username}`
        : `Riallineata utenza esistente (credenziali lasciate intatte): ${username}`,
    );
  } else {
    if (!password) {
      console.error(`L'utenza «${username}» non esiste: per crearla serve una password.`);
      process.exit(1);
    }
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    userId = created.user?.id ?? null;
    if (!userId) throw new Error('createUser non ha restituito user.id');
    console.log(`Creata utenza: ${username}`);
  }

  // `profiles.email` è NOT NULL: ometterlo fa fallire l'upsert.
  const { error: profileErr } = await sb.from('profiles').upsert({
    id: userId,
    email,
    username,
    role: toStoredProfileRole(role),
  });
  if (profileErr) throw new Error(`profiles upsert: ${profileErr.message}`);

  console.log('');
  console.log('─'.repeat(64));
  console.log('Da incollare in App Store Connect → Verifica dell’app →');
  console.log('Informazioni sulla verifica, spuntando «È richiesto l’accesso»:');
  console.log('');
  console.log(`  Nome utente: ${username}`);
  console.log(password
    ? '  Password:    (quella passata a questo script)'
    : '  Password:    invariata — resta quella già in mano ad Apple');
  console.log('');
  console.log(`Moduli visibili: ${allowedModules.length} su ${ALL_MODULE_KEYS.length}`);
  console.log('─'.repeat(64));
  console.log('');
  console.log('ATTENZIONE — lo script crea l’accesso, non i dati.');
  console.log('Questa utenza vede il database a cui punta SUPABASE_URL. Se è la');
  console.log('produzione, il revisore Apple leggerà anagrafiche e rapportini di');
  console.log('clienti reali. Falla puntare a un ambiente con dati demo prima di');
  console.log('consegnare le credenziali.');
}

main().catch((e) => {
  console.error('Fallito:', e?.message ?? e);
  process.exit(1);
});
