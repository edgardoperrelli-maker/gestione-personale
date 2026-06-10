# Permessi: ruoli precompilati + moduli per-utente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** I toggle dei moduli diventano la fonte di verità dell'accesso per-utente; il ruolo solo precompila, pilota la premialità (`admin_plus`) e il tier RLS. `Impostazioni` resta legato al ruolo admin; la sezione Utenze è esclusiva di `admin_plus`; Live/Lista attesa/Misuratori diventano assegnabili anche agli operatori.

**Architecture:** Logica centralizzata in `lib/moduleAccess.ts` (funzioni pure, testate con vitest), consumata da middleware, guard di pagina e API. Niente più forzatura: un unico invariante (`impostazioni` ∈ moduli ⟺ ruolo admin). Anti-lockout sul ruolo `admin_plus` lato server.

**Tech Stack:** Next.js 15 (App Router, server components), Supabase auth-helpers, vitest. Nessuna SQL/RLS.

**Spec di riferimento:** [docs/superpowers/specs/2026-06-09-permessi-moduli-per-utente-design.md](../specs/2026-06-09-permessi-moduli-per-utente-design.md)

**Comandi chiave:**
- Test: `npx vitest run lib/moduleAccess.test.ts`
- Lint mirato: `npx eslint <path>` (la baseline `npm run lint` è già rossa su main)
- Build/type-check: `npm run build`

---

## Task 1: Core logica permessi (`lib/moduleAccess.ts`) — TDD

**Files:**
- Modify: `lib/moduleAccess.ts`
- Test: `lib/moduleAccess.test.ts`

- [ ] **Step 1: Riscrivi il test file con le nuove regole**

Sostituisci INTEGRALMENTE il contenuto di `lib/moduleAccess.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveUserRole,
  canAccessPathFromMetadata,
  buildAppMetadataUpdate,
  normalizeAllowedModules,
  prefillModulesForRole,
  fallbackModulesForRole,
  canManageUsers,
} from './moduleAccess';

describe('resolveUserRole', () => {
  it('admin_plus (solo in app_metadata) è autorizzato come admin', () => {
    expect(resolveUserRole(null, 'admin_plus')).toBe('admin');
  });
  it('admin resta admin', () => {
    expect(resolveUserRole('admin', 'admin')).toBe('admin');
  });
  it('operatore (profilo viewer) resta operatore', () => {
    expect(resolveUserRole('viewer', 'operatore')).toBe('operatore');
  });
  it('ruolo assente → operatore', () => {
    expect(resolveUserRole(null, undefined)).toBe('operatore');
  });
});

describe('canManageUsers', () => {
  it('true solo per admin_plus', () => {
    expect(canManageUsers('admin_plus')).toBe(true);
    expect(canManageUsers('admin')).toBe(false);
    expect(canManageUsers('operatore')).toBe(false);
    expect(canManageUsers(null)).toBe(false);
  });
});

describe('prefillModulesForRole / fallbackModulesForRole', () => {
  it('operatore: pre-fill vuoto, fallback set operativo (senza moduli sensibili)', () => {
    expect(prefillModulesForRole('operatore')).toEqual([]);
    const fb = fallbackModulesForRole('operatore');
    expect(fb).toContain('dashboard');
    expect(fb).toContain('sopralluoghi');
    expect(fb).not.toContain('impostazioni');
    expect(fb).not.toContain('live');
  });
  it('admin/admin_plus: pre-fill e fallback = tutti i moduli (con impostazioni)', () => {
    expect(prefillModulesForRole('admin')).toContain('impostazioni');
    expect(prefillModulesForRole('admin_plus')).toContain('live');
    expect(fallbackModulesForRole('admin')).toContain('impostazioni');
  });
});

describe('normalizeAllowedModules (nessuna forzatura, unico invariante su impostazioni)', () => {
  it('operatore: niente sopralluoghi forzato; live mantenuto se richiesto', () => {
    const out = normalizeAllowedModules(['rapportini', 'live'], 'operatore');
    expect(out).toContain('rapportini');
    expect(out).toContain('live');
    expect(out).not.toContain('sopralluoghi'); // non più forzato
    expect(out).not.toContain('impostazioni'); // operatore non lo ha mai
  });
  it('operatore: impostazioni rimosso anche se richiesto', () => {
    expect(normalizeAllowedModules(['impostazioni', 'mappa'], 'operatore')).toEqual(['mappa']);
  });
  it('admin: impostazioni reintegrato anche se assente dalla richiesta', () => {
    expect(normalizeAllowedModules(['dashboard'], 'admin')).toContain('impostazioni');
  });
  it('input non-array → vuoto (poi invariante)', () => {
    expect(normalizeAllowedModules(undefined, 'operatore')).toEqual([]);
    expect(normalizeAllowedModules(undefined, 'admin')).toEqual(['impostazioni']);
  });
});

describe('canAccessPathFromMetadata (logica del middleware)', () => {
  it('admin può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin' })).toBe(true);
  });
  it('admin_plus può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin_plus' })).toBe(true);
  });
  it('operatore NON può accedere a /impostazioni (gate di ruolo)', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'operatore' })).toBe(false);
  });
  it('operatore con live abilitato PUÒ accedere a /hub/live', () => {
    expect(canAccessPathFromMetadata('/hub/live', { role: 'operatore', allowedModules: ['live'] })).toBe(true);
  });
  it('operatore senza live NON accede a /hub/live', () => {
    expect(canAccessPathFromMetadata('/hub/live', { role: 'operatore', allowedModules: ['rapportini'] })).toBe(false);
  });
  it('operatore con impostazioni anomalo in metadata: resta bloccato (gate ruolo)', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'operatore', allowedModules: ['impostazioni'] })).toBe(false);
  });
});

describe('buildAppMetadataUpdate (PATCH Utenze)', () => {
  it('aggiornando solo i moduli, preserva il ruolo admin_plus e reintegra impostazioni', () => {
    const out = buildAppMetadataUpdate('admin_plus', undefined, undefined, ['dashboard']);
    expect(out.role).toBe('admin_plus');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('aggiornando solo i moduli, preserva il ruolo admin', () => {
    const out = buildAppMetadataUpdate('admin', undefined, undefined, ['dashboard']);
    expect(out.role).toBe('admin');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('cambio esplicito a operatore: ruolo operatore, niente impostazioni', () => {
    const out = buildAppMetadataUpdate('admin', undefined, 'operatore', ['dashboard']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).not.toContain('impostazioni');
  });
  it('operatore può ricevere live', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['live', 'mappa']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).toContain('live');
  });
  it('moduli non inviati: preserva i correnti (ordine di ALL_MODULE_KEYS)', () => {
    const out = buildAppMetadataUpdate('operatore', ['mappa', 'rapportini'], undefined, undefined);
    expect(out.allowedModules).toEqual(['rapportini', 'mappa']); // rapportini precede mappa in ALL_MODULE_KEYS
  });
});
```

- [ ] **Step 2: Esegui i test — devono FALLIRE**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: FAIL — funzioni `prefillModulesForRole`/`fallbackModulesForRole`/`canManageUsers` non esistono e `buildAppMetadataUpdate` ha un'altra firma.

- [ ] **Step 3: Riscrivi `lib/moduleAccess.ts`**

Sostituisci INTEGRALMENTE il contenuto di `lib/moduleAccess.ts`:

```ts
export type ValidRole = 'admin' | 'operatore';

/**
 * Ruolo assegnabile dall'area Utenze. `admin_plus` è un super-admin che, oltre
 * ai privilegi admin, vede il cruscotto premialità e gestisce le Utenze. A
 * livello di AUTORIZZAZIONE resta "admin" (vedi resolveUserRole +
 * toStoredProfileRole). La distinzione "plus" vive in app_metadata.role.
 */
export type AssignableRole = ValidRole | 'admin_plus';

export type AppModuleKey =
  | 'dashboard'
  | 'hotel-calendar'
  | 'rapportini'
  | 'mappa'
  | 'interventi'
  | 'sopralluoghi'
  | 'live'
  | 'lista-attesa'
  | 'misuratori'
  | 'impostazioni';

export type AppModuleDefinition = {
  key: AppModuleKey;
  href: string;
  label: string;
  description: string;
  section: 'overview' | 'modules' | 'system';
  matchPrefixes?: string[];
  /** Modulo "sensibile": escluso dai default operatore + badge in UI. NON è un gate di accesso. */
  adminOnly?: boolean;
  /** Gate FORTE di ruolo: l'accesso richiede ruolo admin. Solo `impostazioni`. */
  requiresAdminRole?: boolean;
};

export const ROLE_LABELS: Record<ValidRole, string> = {
  admin: 'Admin',
  operatore: 'Operatore',
};

export const ASSIGNABLE_ROLE_LABELS: Record<AssignableRole, string> = {
  admin_plus: 'Admin Plus',
  admin: 'Admin',
  operatore: 'Operatore',
};

export const APP_MODULES: AppModuleDefinition[] = [
  {
    key: 'dashboard',
    href: '/dashboard',
    label: 'Cronoprogramma',
    description: 'Pianificazione turni e assegnazioni',
    section: 'modules',
    matchPrefixes: ['/dashboard'],
  },
  {
    key: 'hotel-calendar',
    href: '/hub/hotel-calendar',
    label: 'Calendario Hotel',
    description: 'Prenotazioni e occupazione',
    section: 'modules',
    matchPrefixes: ['/hub/hotel-calendar'],
  },
  {
    key: 'rapportini',
    href: '/hub/rapportini',
    label: 'Rapportini',
    description: 'Massivi e per clientela',
    section: 'modules',
    matchPrefixes: ['/hub/rapportini'],
  },
  {
    key: 'mappa',
    href: '/hub/mappa',
    label: 'Mappa Operatori',
    description: 'Distribuzione territoriale',
    section: 'modules',
    matchPrefixes: ['/hub/mappa'],
  },
  {
    key: 'interventi',
    href: '/hub/interventi',
    label: 'Interventi',
    description: 'Import e gestione interventi',
    section: 'modules',
    matchPrefixes: ['/hub/interventi'],
  },
  {
    key: 'sopralluoghi',
    href: '/hub/sopralluoghi',
    label: 'Sopralluoghi',
    description: 'Gestione sopralluoghi territorio',
    section: 'modules',
    matchPrefixes: ['/hub/sopralluoghi'],
  },
  {
    key: 'live',
    href: '/hub/live',
    label: 'Live',
    description: 'Interventi del giorno in tempo reale',
    section: 'modules',
    matchPrefixes: ['/hub/live'],
    adminOnly: true,
  },
  {
    key: 'lista-attesa',
    href: '/hub/lista-attesa',
    label: 'Lista attesa',
    description: 'Ordini manuali degli operatori',
    section: 'modules',
    matchPrefixes: ['/hub/lista-attesa'],
    adminOnly: true,
  },
  {
    key: 'misuratori',
    href: '/hub/misuratori',
    label: 'Misuratori',
    description: 'Registro misuratori rimossi',
    section: 'modules',
    matchPrefixes: ['/hub/misuratori'],
    adminOnly: true,
  },
  {
    key: 'impostazioni',
    href: '/impostazioni',
    label: 'Impostazioni',
    description: 'Utenze e configurazione accessi',
    section: 'system',
    matchPrefixes: ['/impostazioni'],
    adminOnly: true,
    requiresAdminRole: true,
  },
];

export const ALL_MODULE_KEYS = APP_MODULES.map((module) => module.key);

/** Set operativo non-sensibile: fallback per gli operatori legacy senza metadata. */
export const DEFAULT_ALLOWED_MODULES = APP_MODULES
  .filter((module) => !module.adminOnly)
  .map((module) => module.key);

export function isValidRole(value: unknown): value is ValidRole {
  return value === 'admin' || value === 'operatore';
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === 'admin' || value === 'operatore' || value === 'admin_plus';
}

/**
 * Ruolo "assegnabile" risolto per la UI Utenze: conserva la distinzione
 * `admin_plus` (presente in app_metadata.role), altrimenti ricade su admin/operatore.
 */
export function resolveAssignableRole(
  profileRole?: string | null,
  metadataRole?: unknown,
): AssignableRole {
  if (profileRole === 'admin_plus' || metadataRole === 'admin_plus') return 'admin_plus';
  return resolveUserRole(profileRole, metadataRole);
}

/** Solo `admin_plus` vede il cruscotto premialità (dati economici riservati). */
export function canViewPremialita(role: AssignableRole | null | undefined): boolean {
  return role === 'admin_plus';
}

/** Solo `admin_plus` gestisce la sezione Utenze (creazione/modifica/eliminazione utenti). */
export function canManageUsers(role: AssignableRole | null | undefined): boolean {
  return role === 'admin_plus';
}

/** True per i ruoli con privilegi amministrativi (admin e admin_plus). */
export function isAdminAssignableRole(role: AssignableRole | null | undefined): boolean {
  return role === 'admin' || role === 'admin_plus';
}

export function resolveUserRole(
  profileRole?: string | null,
  metadataRole?: unknown,
): ValidRole {
  if (profileRole === 'admin_plus' || metadataRole === 'admin_plus') return 'admin';
  if (isValidRole(profileRole)) return profileRole;
  if (profileRole === 'editor' || profileRole === 'viewer') return 'operatore';
  if (isValidRole(metadataRole)) return metadataRole;
  if (metadataRole === 'editor' || metadataRole === 'viewer') return 'operatore';
  return 'operatore';
}

export function toStoredProfileRole(role: AssignableRole): 'admin' | 'viewer' {
  return isAdminAssignableRole(role) ? 'admin' : 'viewer';
}

/** Template di pre-compilazione mostrato nella UI Utenze quando si seleziona un ruolo. */
export function prefillModulesForRole(role?: AssignableRole | null): AppModuleKey[] {
  if (isAdminAssignableRole(role)) return [...ALL_MODULE_KEYS];
  return []; // operatore: parte vuoto
}

/** Default usato SOLO quando l'utente non ha `allowedModules` nei metadata (legacy). */
export function fallbackModulesForRole(role?: AssignableRole | null): AppModuleKey[] {
  if (isAdminAssignableRole(role)) return [...ALL_MODULE_KEYS];
  return [...DEFAULT_ALLOWED_MODULES]; // operatore legacy: set operativo
}

/**
 * Valida la lista moduli contro le chiavi note. UNICO invariante: `impostazioni`
 * è presente se e solo se il ruolo è admin/admin_plus. Nessun'altra forzatura.
 */
export function normalizeAllowedModules(
  input: unknown,
  role?: AssignableRole | null,
): AppModuleKey[] {
  const raw = Array.isArray(input) ? input : [];
  const set = new Set<AppModuleKey>(ALL_MODULE_KEYS.filter((key) => raw.includes(key)));
  if (isAdminAssignableRole(role)) set.add('impostazioni');
  else set.delete('impostazioni');
  return ALL_MODULE_KEYS.filter((key) => set.has(key)); // ordine stabile
}

function extractAppMetadata(value: unknown): { allowedModules?: unknown; role?: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  return value as { allowedModules?: unknown; role?: unknown };
}

export function getAllowedModulesForUser(appMetadata: unknown, role?: AssignableRole | null): AppModuleKey[] {
  const metadata = extractAppMetadata(appMetadata);
  const metadataRole = isAssignableRole(metadata?.role) ? metadata.role : null;
  const effectiveRole = role ?? metadataRole;
  if (!Array.isArray(metadata?.allowedModules)) {
    return fallbackModulesForRole(effectiveRole);
  }
  return normalizeAllowedModules(metadata.allowedModules, effectiveRole);
}

export function findModuleByPath(pathname: string): AppModuleDefinition | null {
  return APP_MODULES.find((module) => {
    const prefixes = module.matchPrefixes?.length ? module.matchPrefixes : [module.href];
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
  }) ?? null;
}

export function canAccessPath(pathname: string, allowedModules: AppModuleKey[], role?: ValidRole | null): boolean {
  const matchedModule = findModuleByPath(pathname);
  if (!matchedModule) return true;
  if (matchedModule.requiresAdminRole && role !== 'admin') return false; // solo impostazioni
  return allowedModules.includes(matchedModule.key);
}

/**
 * Decisione di accesso usata dal middleware, basata SOLO su `app_metadata`.
 * `admin_plus` è trattato come `admin` (vedi resolveUserRole).
 */
export function canAccessPathFromMetadata(pathname: string, appMetadata: unknown): boolean {
  const metadataRole = extractAppMetadata(appMetadata)?.role;
  const role = resolveUserRole(null, metadataRole);
  const allowedModules = getAllowedModulesForUser(appMetadata, role);
  return canAccessPath(pathname, allowedModules, role);
}

/**
 * Costruisce l'app_metadata da salvare in un aggiornamento utente (PATCH Utenze).
 * Senza `requestedRole` usa il ruolo corrente (non declassare aggiornando i soli moduli).
 * Senza `requestedModules` preserva i moduli correnti. Applica sempre l'invariante
 * `impostazioni` ⟺ ruolo admin.
 */
export function buildAppMetadataUpdate(
  currentMetadataRole: unknown,
  currentAllowedModules: unknown,
  requestedRole: AssignableRole | undefined,
  requestedModules: unknown,
): { role: AssignableRole; allowedModules: AppModuleKey[] } {
  const effectiveRole = requestedRole ?? resolveAssignableRole(undefined, currentMetadataRole);
  const modulesInput = Array.isArray(requestedModules)
    ? requestedModules
    : (Array.isArray(currentAllowedModules) ? currentAllowedModules : prefillModulesForRole(effectiveRole));
  return {
    role: effectiveRole,
    allowedModules: normalizeAllowedModules(modulesInput, effectiveRole),
  };
}
```

- [ ] **Step 4: Esegui i test — devono PASSARE**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: PASS (tutti). Se l'ultimo test sull'ordine fallisce, allinea l'array atteso all'ordine di `ALL_MODULE_KEYS`.

- [ ] **Step 5: Lint dei file core**

Run: `npx eslint lib/moduleAccess.ts lib/moduleAccess.test.ts`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add lib/moduleAccess.ts lib/moduleAccess.test.ts
git commit -m "feat(permessi): core moduleAccess senza forzatura, invariante impostazioni, helper admin_plus"
```

---

## Task 2: API Utenze — `requireAdminPlus` + anti-lockout (`app/api/admin/users/route.ts`)

**Files:**
- Modify: `app/api/admin/users/route.ts`

- [ ] **Step 1: Riscrivi INTEGRALMENTE `app/api/admin/users/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  APP_MODULES,
  getAllowedModulesForUser,
  normalizeAllowedModules,
  buildAppMetadataUpdate,
  ASSIGNABLE_ROLE_LABELS,
  resolveAssignableRole,
  canManageUsers,
  toStoredProfileRole,
  isAssignableRole,
  type AppModuleKey,
  type AssignableRole,
} from '@/lib/moduleAccess';

const LOCAL_DOMAIN = '@local.it';
const LEGACY_LOCAL_DOMAIN = '@local';

function normalizeUsername(value: string): string {
  const t = value.trim().toLowerCase();
  const withoutDomain =
    t.endsWith(LOCAL_DOMAIN) ? t.slice(0, -LOCAL_DOMAIN.length) :
    t.endsWith(LEGACY_LOCAL_DOMAIN) ? t.slice(0, -LEGACY_LOCAL_DOMAIN.length) :
    t;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

function toEmail(username: string): string {
  return `u_${normalizeUsername(username)}${LOCAL_DOMAIN}`;
}

function toUsername(email: string): string {
  return normalizeUsername(email);
}

/** Solo gli Admin Plus possono operare sulla sezione Utenze. */
async function requireAdminPlus(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'Riservato agli Admin Plus.' }, { status: 403 });
  }
  return { userId: user.id };
}

/** Conta gli utenti con ruolo assegnabile admin_plus (per l'anti-lockout). */
async function countAdminPlus(): Promise<number> {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  return (data?.users ?? []).filter(
    (u) => resolveAssignableRole(undefined, u.app_metadata?.role) === 'admin_plus',
  ).length;
}

/* GET — lista tutti gli utenti */
export async function GET() {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;

  const [authRes, profilesRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    supabaseAdmin.from('profiles').select('id, username, role'),
  ]);

  if (authRes.error) {
    return NextResponse.json({ error: authRes.error.message }, { status: 500 });
  }

  const profileMap = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; username: string; role: string }>)
      .map((p) => [p.id, p])
  );

  const users = (authRes.data?.users ?? []).map((u) => {
    const profile = profileMap.get(u.id);
    const role = resolveAssignableRole(profile?.role, u.app_metadata?.role);
    return {
      userId: u.id,
      email: u.email ?? '',
      username: profile?.username ?? toUsername(u.email ?? ''),
      role,
      roleLabel: ASSIGNABLE_ROLE_LABELS[role],
      allowedModules: getAllowedModulesForUser(u.app_metadata, role),
      createdAt: u.created_at,
    };
  }).sort((a, b) => a.username.localeCompare(b.username, 'it'));

  return NextResponse.json({
    users,
    currentUserId: guard.userId,
    availableModules: APP_MODULES.map((module) => ({
      key: module.key,
      label: module.label,
      description: module.description,
      adminOnly: !!module.adminOnly,
      requiresAdminRole: !!module.requiresAdminRole,
    })),
  });
}

/* POST — crea nuovo utente */
export async function POST(req: NextRequest) {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    username?: string;
    password?: string;
    role?: string;
    allowedModules?: AppModuleKey[];
  };

  const username = normalizeUsername(body.username ?? '');
  const password = (body.password ?? '').trim();
  const role: AssignableRole = isAssignableRole(body.role) ? body.role : 'operatore';
  const allowedModules = normalizeAllowedModules(body.allowedModules, role);

  if (!username) return NextResponse.json({ error: 'Username richiesto.' }, { status: 400 });
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }

  const email = toEmail(username);

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, allowedModules },
  });

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Errore creazione utente.' }, { status: 400 });
  }

  const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
    id: authData.user.id,
    username,
    role: toStoredProfileRole(role),
  });

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      userId: authData.user.id,
      email,
      username,
      role,
      roleLabel: ASSIGNABLE_ROLE_LABELS[role],
      allowedModules,
      createdAt: authData.user.created_at,
    },
  });
}

/* PATCH — aggiorna password, ruolo e/o moduli */
export async function PATCH(req: NextRequest) {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    userId?: string;
    password?: string;
    role?: string;
    username?: string;
    allowedModules?: AppModuleKey[];
  };

  const userId = (body.userId ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'userId richiesto.' }, { status: 400 });

  // Stato corrente del target (serve per anti-lockout e per preservare i moduli).
  const { data: current, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 400 });
  const currentMetaRole = current?.user?.app_metadata?.role;
  const currentModules = current?.user?.app_metadata?.allowedModules;
  const currentAssignable = resolveAssignableRole(undefined, currentMetaRole);

  const requestedRole = isAssignableRole(body.role) ? body.role : undefined;

  // ANTI-LOCKOUT: declassamento di un admin_plus.
  if (currentAssignable === 'admin_plus' && requestedRole && requestedRole !== 'admin_plus') {
    if (userId === guard.userId) {
      return NextResponse.json({ error: 'Non puoi rimuovere a te stesso il ruolo Admin Plus.' }, { status: 403 });
    }
    if (await countAdminPlus() <= 1) {
      return NextResponse.json({ error: 'Deve restare almeno un Admin Plus.' }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.password && body.password.trim().length >= 6) {
    updates.password = body.password.trim();
  } else if (body.password && body.password.trim().length > 0) {
    return NextResponse.json({ error: 'Password minimo 6 caratteri.' }, { status: 400 });
  }
  if (body.username && normalizeUsername(body.username)) {
    updates.email = toEmail(body.username);
  }

  if (requestedRole || Array.isArray(body.allowedModules)) {
    updates.app_metadata = buildAppMetadataUpdate(
      currentMetaRole,
      currentModules,
      requestedRole,
      body.allowedModules,
    );
  }

  if (Object.keys(updates).length > 0) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, updates);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = { id: userId };
  if (body.username) profilePatch.username = normalizeUsername(body.username);
  if (requestedRole) profilePatch.role = toStoredProfileRole(requestedRole);

  if (Object.keys(profilePatch).length > 1) {
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(profilePatch);
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* DELETE — elimina utente */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;

  const { userId } = await req.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: 'userId richiesto.' }, { status: 400 });
  if (userId === guard.userId) {
    return NextResponse.json({ error: 'Non puoi eliminare l’utenza con cui sei autenticato.' }, { status: 400 });
  }

  // ANTI-LOCKOUT: non eliminare l'ultimo admin_plus.
  const { data: target } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (resolveAssignableRole(undefined, target?.user?.app_metadata?.role) === 'admin_plus') {
    if (await countAdminPlus() <= 1) {
      return NextResponse.json({ error: 'Deve restare almeno un Admin Plus.' }, { status: 403 });
    }
  }

  const { error: auditErr } = await supabaseAdmin
    .from('audit_log')
    .update({ actor: null })
    .eq('actor', userId);

  if (auditErr) {
    return NextResponse.json({ error: auditErr.message }, { status: 500 });
  }

  const { error: profileErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Lint del route**

Run: `npx eslint app/api/admin/users/route.ts`
Expected: nessun errore (verifica che non restino import inutilizzati, es. `resolveUserRole` rimosso).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/users/route.ts
git commit -m "feat(permessi): API Utenze riservata ad admin_plus + anti-lockout ultimo admin_plus"
```

---

## Task 3: Guard di navigazione su modulo (Live / Lista attesa / Misuratori)

**Files:**
- Modify: `app/hub/live/page.tsx`
- Modify: `app/hub/lista-attesa/page.tsx`
- Modify: `app/hub/misuratori/page.tsx`

- [ ] **Step 1: `app/hub/live/page.tsx` — gate su modulo `live`**

Cambia l'import (riga 4) da:

```ts
import { resolveUserRole } from '@/lib/moduleAccess';
```

a:

```ts
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
```

Poi sostituisci (righe 25-27):

```ts
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') redirect('/hub');
```

con:

```ts
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('live')) redirect('/hub');
```

- [ ] **Step 2: `app/hub/lista-attesa/page.tsx` — gate su modulo `lista-attesa`**

Cambia l'import (riga 4) da:

```ts
import { resolveUserRole } from '@/lib/moduleAccess';
```

a:

```ts
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
```

Poi sostituisci (righe 21-23):

```ts
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') redirect('/hub');
```

con:

```ts
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('lista-attesa')) redirect('/hub');
```

> Nota: nel resto di `lista-attesa/page.tsx` la query `profiles ... .eq('role','admin')` (mappa nomi admin per la coda) resta invariata: serve solo per visualizzare chi ha preso in carico, non come gate.

- [ ] **Step 3: `app/hub/misuratori/page.tsx` — converti a server component con gate su modulo `misuratori`**

Sostituisci INTEGRALMENTE il file:

```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import AuthGate from '@/components/AuthGate';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

export default async function MisuratoriPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('misuratori')) redirect('/hub');

  return (
    <AuthGate>
      <MisuratoriClient />
    </AuthGate>
  );
}
```

- [ ] **Step 4: Lint**

Run: `npx eslint app/hub/live/page.tsx app/hub/lista-attesa/page.tsx app/hub/misuratori/page.tsx`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/hub/live/page.tsx app/hub/lista-attesa/page.tsx app/hub/misuratori/page.tsx
git commit -m "feat(permessi): gate Live/Lista attesa/Misuratori su modulo (assegnabili anche a operatori)"
```

---

## Task 4: Sezione Impostazioni — roleLabel + gate Utenze su admin_plus

**Files:**
- Modify: `app/impostazioni/layout.tsx`
- Modify: `app/impostazioni/utenze/page.tsx`

- [ ] **Step 1: `app/impostazioni/layout.tsx` — roleLabel reale**

Cambia l'import (riga 6) da:

```ts
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
```

a:

```ts
import { ASSIGNABLE_ROLE_LABELS, getAllowedModulesForUser, resolveAssignableRole, resolveUserRole } from '@/lib/moduleAccess';
```

Poi sostituisci (riga 23):

```ts
  const roleLabel = 'Admin';
```

con:

```ts
  const roleLabel = ASSIGNABLE_ROLE_LABELS[resolveAssignableRole(profile?.role, user.app_metadata?.role)];
```

> Il gate `if (effectiveRole !== 'admin') redirect('/dashboard')` resta invariato: la sezione è per admin e admin_plus.

- [ ] **Step 2: `app/impostazioni/utenze/page.tsx` — gate admin_plus**

Sostituisci INTEGRALMENTE il file:

```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';
import UtenzeClient from './UtenzeClient';

export const dynamic = 'force-dynamic';

export default async function UtenzePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!canManageUsers(resolveAssignableRole(profile?.role, user.app_metadata?.role))) {
    redirect('/impostazioni');
  }
  return <UtenzeClient />;
}
```

- [ ] **Step 3: Lint**

Run: `npx eslint app/impostazioni/layout.tsx app/impostazioni/utenze/page.tsx`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add app/impostazioni/layout.tsx app/impostazioni/utenze/page.tsx
git commit -m "feat(permessi): Utenze riservata ad admin_plus + roleLabel reale nella sezione"
```

---

## Task 5: Nascondi Utenze ai non-admin_plus (home sezione + sub-nav)

**Files:**
- Modify: `app/impostazioni/page.tsx`
- Modify: `components/layout/SettingsSubNav.tsx`
- Modify: `app/impostazioni/hotel/page.tsx`
- Modify: `app/impostazioni/hotel/HotelClient.tsx`

- [ ] **Step 1: `app/impostazioni/page.tsx` — server component che filtra la card Utenze**

Sostituisci INTEGRALMENTE il file:

```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

const MODULES = [
  {
    href: '/impostazioni/utenze',
    title: 'Utenze',
    description: 'Gestisci password, ruoli e moduli visibili per ogni utente di accesso.',
    icon: 'U',
    requiresAdminPlus: true,
  },
  {
    href: '/impostazioni/personale',
    title: 'Personale',
    description: 'Definisci validita e indirizzo di partenza degli operatori del cronoprogramma.',
    icon: 'P',
  },
  {
    href: '/impostazioni/territori',
    title: 'Territori',
    description: 'Gestisci territori, coordinate mappa e validita temporale condivisa con cronoprogramma e mappa.',
    icon: 'T',
  },
  {
    href: '/impostazioni/gruppo-attivita',
    title: 'Gruppo Attivita',
    description: 'Gestisci elenco attivita condiviso da cronoprogramma, mappa e sopralluoghi.',
    icon: 'A',
  },
  {
    href: '/impostazioni/zone-ztl',
    title: 'Zone ZTL',
    description: 'Definisci zone a traffico limitato, CAP e operatori autorizzati.',
    icon: 'Z',
  },
  {
    href: '/impostazioni/hotel',
    title: 'Hotel',
    description: 'Strutture ricettive per le trasferte: territorio di riferimento, email e prezzi correnti per tipologia camera.',
    icon: 'H',
  },
  {
    href: '/impostazioni/codici-allegato10',
    title: 'Codici Allegato 10',
    description: 'Seleziona i codici servizio per i quali viene generato automaticamente il verbale Word.',
    icon: 'W',
  },
  {
    href: '/impostazioni/template-rapportini',
    title: 'Template rapportini',
    description: 'Configura i campi dei rapportini compilabili dai tecnici.',
    icon: 'R',
  },
  {
    href: '/impostazioni/risanamento-misuratori',
    title: 'Estrazione misuratori',
    description: 'Importa l\'estrazione misuratori (Excel/CSV) usata dal flusso risanamento colonne.',
    icon: 'M',
  },
];

export default async function ImpostazioniPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isAdminPlus = canManageUsers(resolveAssignableRole(profile?.role, user?.app_metadata?.role));
  const modules = MODULES.filter((module) => !module.requiresAdminPlus || isAdminPlus);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Impostazioni</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Gestisci la configurazione dell&apos;app e gli accessi agli utenti
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary-soft)] text-2xl font-bold text-[var(--brand-primary)]">
              {module.icon}
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--brand-text-main)]">{module.title}</h2>
            <p className="mb-4 text-sm text-[var(--brand-text-muted)]">{module.description}</p>
            <div className="flex items-center text-sm font-semibold text-[var(--brand-primary)]">
              Gestisci
              <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `components/layout/SettingsSubNav.tsx` — prop `isAdminPlus` che filtra il tab Utenze**

Sostituisci INTEGRALMENTE il file:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/impostazioni/utenze',    label: 'Utenze', requiresAdminPlus: true },
  { href: '/impostazioni/personale', label: 'Personale' },
  { href: '/impostazioni/territori', label: 'Territori' },
  { href: '/impostazioni/gruppo-attivita', label: 'Attivita' },
  { href: '/impostazioni/hotel',     label: 'Hotel' },
  { href: '/impostazioni/zone-ztl',  label: 'Zone ZTL' },
];

export default function SettingsSubNav({ isAdminPlus = false }: { isAdminPlus?: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => !tab.requiresAdminPlus || isAdminPlus);
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--brand-border)] pb-4">
      {tabs.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]'
                : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--brand-primary)]'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `app/impostazioni/hotel/page.tsx` — risolvi admin_plus e passalo a HotelClient**

Sostituisci INTEGRALMENTE il file:

```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import HotelClient from './HotelClient';
import type { Hotel, Territory } from '@/types';
import { canManageUsers, resolveAssignableRole } from '@/lib/moduleAccess';

export const dynamic = 'force-dynamic';

export default async function HotelPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isAdminPlus = canManageUsers(resolveAssignableRole(profile?.role, user?.app_metadata?.role));

  const [{ data: hotelsRaw }, { data: territories }] = await Promise.all([
    supabase
      .from('hotels')
      .select('*, territory:territories(id,name), room_prices:hotel_room_prices(id,hotel_id,room_type,price_per_night,dinner_price_per_person,notes)')
      .order('name'),
    supabase
      .from('territories')
      .select('id,name,active')
      .order('name'),
  ]);

  return (
    <HotelClient
      initialHotels={(hotelsRaw ?? []) as Hotel[]}
      territories={(territories ?? []) as Territory[]}
      isAdminPlus={isAdminPlus}
    />
  );
}
```

- [ ] **Step 4: `app/impostazioni/hotel/HotelClient.tsx` — accetta `isAdminPlus` e passalo alla sub-nav**

Cambia la firma del componente (cerca `export default function HotelClient({`) da:

```tsx
export default function HotelClient({
  initialHotels,
  territories,
}: {
  initialHotels: Hotel[];
  territories: Territory[];
}) {
```

a:

```tsx
export default function HotelClient({
  initialHotels,
  territories,
  isAdminPlus = false,
}: {
  initialHotels: Hotel[];
  territories: Territory[];
  isAdminPlus?: boolean;
}) {
```

Poi trova l'uso di `<SettingsSubNav />` nel JSX e sostituiscilo con:

```tsx
<SettingsSubNav isAdminPlus={isAdminPlus} />
```

- [ ] **Step 5: Lint**

Run: `npx eslint app/impostazioni/page.tsx components/layout/SettingsSubNav.tsx app/impostazioni/hotel/page.tsx app/impostazioni/hotel/HotelClient.tsx`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/impostazioni/page.tsx components/layout/SettingsSubNav.tsx app/impostazioni/hotel/page.tsx app/impostazioni/hotel/HotelClient.tsx
git commit -m "feat(permessi): nascondi Utenze ai non-admin_plus (card home + sub-nav)"
```

---

## Task 6: UI Utenze — pre-fill, toggle liberi, anti-lockout in UI (`UtenzeClient.tsx`)

**Files:**
- Modify: `app/impostazioni/utenze/UtenzeClient.tsx`

- [ ] **Step 1: Sostituisci INTEGRALMENTE `app/impostazioni/utenze/UtenzeClient.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  prefillModulesForRole,
  ASSIGNABLE_ROLE_LABELS,
  type AppModuleKey,
  type AssignableRole,
} from '@/lib/moduleAccess';

type ModuleOption = {
  key: AppModuleKey;
  label: string;
  description: string;
  adminOnly: boolean;
  requiresAdminRole: boolean;
};

type UserRow = {
  userId: string;
  email: string;
  username: string;
  role: AssignableRole;
  roleLabel: string;
  allowedModules: AppModuleKey[];
  createdAt: string;
};

type EditRow = UserRow & { newPassword: string };

type Feedback = { type: 'success' | 'error'; text: string } | null;

const ROLE_COLORS: Record<AssignableRole, string> = {
  admin_plus: 'var(--brand-gold)',
  admin: 'var(--danger)',
  operatore: 'var(--success)',
};

const inputCls =
  'w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]';
const inputStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' };

function normalizeUsername(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutDomain =
    trimmed.endsWith('@local.it') ? trimmed.slice(0, -'@local.it'.length) :
    trimmed.endsWith('@local') ? trimmed.slice(0, -'@local'.length) :
    trimmed;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

function formatDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ModuleSelector({
  selected,
  modules,
  onToggle,
}: {
  selected: AppModuleKey[];
  modules: ModuleOption[];
  onToggle: (moduleKey: AppModuleKey) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => {
        const checked = selected.includes(module.key);
        const locked = module.requiresAdminRole; // Impostazioni: segue il ruolo, non si tocca

        return (
          <label
            key={module.key}
            className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition ${
              locked ? 'opacity-60' : 'cursor-pointer hover:border-[var(--brand-primary)]'
            }`}
            style={{
              borderColor: checked ? 'var(--brand-primary)' : 'var(--brand-border)',
              backgroundColor: checked ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={locked}
              onChange={() => onToggle(module.key)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                {module.label}
                {module.requiresAdminRole ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--brand-surface-muted)', color: 'var(--brand-text-muted)' }}
                  >
                    Segue il ruolo
                  </span>
                ) : module.adminOnly ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--info-soft)', color: 'var(--info)' }}
                  >
                    Sensibile
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--brand-text-muted)' }}>
                {module.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default function UtenzeClient() {
  const [users, setUsers] = useState<EditRow[]>([]);
  const [availableModules, setAvailableModules] = useState<ModuleOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: AssignableRole;
    allowedModules: AppModuleKey[];
  }>({
    username: '',
    password: '',
    role: 'operatore',
    allowedModules: prefillModulesForRole('operatore'),
  });

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        const json = await res.json() as { users?: UserRow[]; availableModules?: ModuleOption[]; currentUserId?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Errore caricamento utenti.');
        if (!active) return;
        setAvailableModules(json.availableModules ?? []);
        setCurrentUserId(json.currentUserId ?? null);
        setUsers((json.users ?? []).map((user) => ({
          ...user,
          newPassword: '',
        })));
      } catch (err) {
        if (active) {
          showFeedback('error', err instanceof Error ? err.message : 'Errore.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const updateRow = (userId: string, patch: Partial<EditRow>) => {
    setUsers((prev) => prev.map((user) => (user.userId === userId ? { ...user, ...patch } : user)));
  };

  const toggleCreateModule = (moduleKey: AppModuleKey) => {
    setForm((prev) => {
      const hasModule = prev.allowedModules.includes(moduleKey);
      const nextModules = hasModule
        ? prev.allowedModules.filter((item) => item !== moduleKey)
        : [...prev.allowedModules, moduleKey];
      return { ...prev, allowedModules: nextModules };
    });
  };

  const toggleUserModule = (user: EditRow, moduleKey: AppModuleKey) => {
    const hasModule = user.allowedModules.includes(moduleKey);
    const nextModules = hasModule
      ? user.allowedModules.filter((item) => item !== moduleKey)
      : [...user.allowedModules, moduleKey];
    updateRow(user.userId, { allowedModules: nextModules });
  };

  const handleCreateRoleChange = (role: AssignableRole) => {
    setForm((prev) => ({ ...prev, role, allowedModules: prefillModulesForRole(role) }));
  };

  const handleCreate = async () => {
    if (!form.username.trim()) return showFeedback('error', 'Username richiesto.');
    if (form.password.length < 6) return showFeedback('error', 'Password minimo 6 caratteri.');

    setCreating(true);
    try {
      const payload = {
        username: normalizeUsername(form.username),
        password: form.password,
        role: form.role,
        allowedModules: form.allowedModules,
      };

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { ok?: boolean; user?: UserRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore creazione.');

      setUsers((prev) => [...prev, {
        ...json.user!,
        newPassword: '',
      }].sort((a, b) => a.username.localeCompare(b.username, 'it')));

      setForm({
        username: '',
        password: '',
        role: 'operatore',
        allowedModules: prefillModulesForRole('operatore'),
      });
      showFeedback('success', `Utenza "${json.user?.username}" creata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (user: EditRow) => {
    setSaving(user.userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          username: normalizeUsername(user.username),
          role: user.role,
          password: user.newPassword || undefined,
          allowedModules: user.allowedModules,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore salvataggio.');
      updateRow(user.userId, { newPassword: '' });
      showFeedback('success', `Utenza "${user.username}" aggiornata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore eliminazione.');
      setUsers((prev) => prev.filter((user) => user.userId !== userId));
      showFeedback('success', `Utenza "${username}" eliminata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text-main)' }}>Impostazioni Utenze</h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Il ruolo precompila i moduli; poi puoi abilitarli o disabilitarli liberamente per ogni utente.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <section className="rounded-3xl border bg-[var(--brand-surface)] shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Nuova utenza</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            L&apos;accesso viene creato nel formato <code className="rounded bg-[var(--brand-surface-muted)] px-1">u_username@local.it</code>.
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: normalizeUsername(e.target.value) }))}
              placeholder="es. mario.rossi"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Password iniziale</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Minimo 6 caratteri"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
            <select
              value={form.role}
              onChange={(e) => handleCreateRoleChange(e.target.value as AssignableRole)}
              className={inputCls}
              style={inputStyle}
            >
              {Object.entries(ASSIGNABLE_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t px-5 py-5" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli visibili</h3>
              <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                Impostazioni segue il ruolo (sempre per gli admin, mai per gli operatori); gli altri moduli sono liberi.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, allowedModules: prefillModulesForRole(prev.role) }))}
                className="rounded-xl border px-3 py-2 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
              >
                Reimposta ai default del ruolo
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {creating ? 'Creazione...' : 'Crea utenza'}
              </button>
            </div>
          </div>

          <ModuleSelector
            selected={form.allowedModules}
            modules={availableModules}
            onToggle={toggleCreateModule}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-[var(--brand-surface)] shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Utenze configurate</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              Modifica direttamente password, ruolo e moduli associati a ogni utente.
            </p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
            {users.length} utenti
          </span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Caricamento utenze...</div>
        ) : users.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna utenza configurata.</div>
        ) : (
          <div className="grid gap-4 p-5">
            {users.map((user) => {
              const isSelf = user.userId === currentUserId;
              return (
              <article
                key={user.userId}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white uppercase"
                      style={{ backgroundColor: ROLE_COLORS[user.role] }}
                    >
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>{user.username}</p>
                      <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Creato il {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: ROLE_COLORS[user.role] }}
                    >
                      {ASSIGNABLE_ROLE_LABELS[user.role]}
                    </span>
                    {resetId === user.userId ? (
                      <button
                        type="button"
                        onClick={() => { setResetId(null); setNewPwd(''); }}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        ← Indietro
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setResetId(user.userId); setNewPwd(''); }}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Reset password
                      </button>
                    )}
                    {confirmDelete === user.userId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDelete(user.userId, user.username)}
                          disabled={deleting === user.userId}
                          className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] px-3 py-1.5 text-xs font-semibold transition"
                        >
                          {deleting === user.userId ? 'Elimino...' : 'Conferma eliminazione'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium"
                          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(user.userId)}
                        disabled={isSelf}
                        title={isSelf ? 'Non puoi eliminare la tua utenza' : undefined}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium transition enabled:hover:border-[var(--danger)] enabled:hover:text-[var(--danger)] disabled:opacity-50"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>

                {resetId === user.userId && (
                  <div className="mt-3 flex items-center gap-1 rounded-lg border border-[var(--info)] bg-[var(--info-soft)] p-3">
                    <input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Nuova password (min. 6 car.)"
                      className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] px-2 py-1 text-xs flex-1 max-w-xs"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        if (newPwd.length < 6) return;
                        setResetting(true);
                        try {
                          const response = await fetch('/api/admin/users', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: user.userId, password: newPwd }),
                          });
                          if (response.ok) {
                            showFeedback('success', `Password resettata per "${user.username}"`);
                            setResetId(null);
                            setNewPwd('');
                          } else {
                            const json = await response.json() as { error?: string };
                            showFeedback('error', json.error ?? 'Errore nel reset password');
                          }
                        } catch (err) {
                          showFeedback('error', err instanceof Error ? err.message : 'Errore');
                        } finally {
                          setResetting(false);
                        }
                      }}
                      disabled={resetting || newPwd.length < 6}
                      className="rounded bg-[var(--brand-primary)] px-3 py-1 text-xs text-[oklch(0.16_0.06_245)] font-medium disabled:opacity-50 transition"
                    >
                      {resetting ? '...' : 'Salva'}
                    </button>
                    <button
                      onClick={() => { setResetId(null); setNewPwd(''); }}
                      className="rounded border border-[var(--brand-border)] px-3 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface)] transition"
                    >
                      Annulla
                    </button>
                  </div>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Username</label>
                    <input
                      type="text"
                      value={user.username}
                      onChange={(e) => updateRow(user.userId, { username: normalizeUsername(e.target.value) })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Nuova password</label>
                    <input
                      type="password"
                      value={user.newPassword}
                      onChange={(e) => updateRow(user.userId, { newPassword: e.target.value })}
                      placeholder="Lascia vuoto per non cambiare"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
                    <select
                      value={user.role}
                      disabled={isSelf}
                      title={isSelf ? 'Non puoi cambiare il tuo ruolo' : undefined}
                      onChange={(e) => updateRow(user.userId, {
                        role: e.target.value as AssignableRole,
                        allowedModules: prefillModulesForRole(e.target.value as AssignableRole),
                      })}
                      className={`${inputCls} disabled:opacity-60`}
                      style={inputStyle}
                    >
                      {Object.entries(ASSIGNABLE_ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli abilitati</h3>
                      <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Impostazioni segue il ruolo; gli altri moduli sono liberamente abilitabili.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateRow(user.userId, { allowedModules: prefillModulesForRole(user.role) })}
                        className="rounded-xl border px-3 py-2 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Reimposta ai default del ruolo
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave(user)}
                        disabled={saving === user.userId}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:opacity-60"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {saving === user.userId ? 'Salvo...' : 'Salva modifiche'}
                      </button>
                    </div>
                  </div>

                  <ModuleSelector
                    selected={user.allowedModules}
                    modules={availableModules}
                    onToggle={(moduleKey) => toggleUserModule(user, moduleKey)}
                  />
                </div>
              </article>
            );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint app/impostazioni/utenze/UtenzeClient.tsx`
Expected: nessun errore (nessun import inutilizzato: `normalizeAllowedModules`/`DEFAULT_ALLOWED_MODULES`/`isAdminAssignableRole` non sono più importati).

- [ ] **Step 3: Commit**

```bash
git add app/impostazioni/utenze/UtenzeClient.tsx
git commit -m "feat(permessi): UI Utenze con pre-fill ruolo, toggle liberi e guard anti-lockout su di sé"
```

---

## Task 7: Rifinitura promo Live in hub (`app/hub/page.tsx`)

**Files:**
- Modify: `app/hub/page.tsx`

- [ ] **Step 1: Importa `getAllowedModulesForUser`**

Cambia l'import (riga 8) da:

```ts
import { canViewPremialita, resolveAssignableRole, isAdminAssignableRole } from '@/lib/moduleAccess';
```

a:

```ts
import { canViewPremialita, resolveAssignableRole, getAllowedModulesForUser } from '@/lib/moduleAccess';
```

- [ ] **Step 2: Calcola `showLivePromo` dai moduli**

Sostituisci (righe 130-132):

```ts
  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const showPremialita = canViewPremialita(role);
  const isAdmin = isAdminAssignableRole(role);
```

con:

```ts
  const role = resolveAssignableRole(profile?.role, user?.app_metadata?.role);
  const showPremialita = canViewPremialita(role);
  const allowedModules = getAllowedModulesForUser(user?.app_metadata, role);
  const showLivePromo = allowedModules.includes('live');
```

- [ ] **Step 3: Usa `showLivePromo` per il blocco promo**

Sostituisci (riga 150):

```tsx
      {isAdmin && (
```

con:

```tsx
      {showLivePromo && (
```

- [ ] **Step 4: Lint**

Run: `npx eslint app/hub/page.tsx`
Expected: nessun errore (nessun `isAdmin`/`isAdminAssignableRole` orfano).

- [ ] **Step 5: Commit**

```bash
git add app/hub/page.tsx
git commit -m "feat(permessi): promo Live in hub mostrata in base al modulo, non al ruolo"
```

---

## Task 8: Verifica finale (test + build + manuale)

**Files:** nessuno (verifica)

- [ ] **Step 1: Test unitari**

Run: `npx vitest run lib/moduleAccess.test.ts`
Expected: PASS (tutti).

- [ ] **Step 2: Build / type-check completo**

Run: `npm run build`
Expected: build OK, nessun errore TypeScript. (Può essere lenta.)

- [ ] **Step 3: Lint mirato su tutti i file toccati**

Run:
```bash
npx eslint lib/moduleAccess.ts lib/moduleAccess.test.ts app/api/admin/users/route.ts app/hub/live/page.tsx app/hub/lista-attesa/page.tsx app/hub/misuratori/page.tsx app/impostazioni/layout.tsx app/impostazioni/utenze/page.tsx app/impostazioni/utenze/UtenzeClient.tsx app/impostazioni/page.tsx components/layout/SettingsSubNav.tsx app/impostazioni/hotel/page.tsx app/impostazioni/hotel/HotelClient.tsx app/hub/page.tsx
```
Expected: nessun errore NUOVO introdotto dai file toccati.

- [ ] **Step 4: Verifica manuale (avvio `npm run dev`)**

Verifica questi scenari (login come utenti diversi):

1. **admin_plus**: vede la sezione Impostazioni con la card/tab **Utenze**; apre Utenze; crea un operatore → i moduli partono **vuoti**; cambia ruolo a Admin → si spuntano **tutti** (incl. Impostazioni bloccata ✓); torna a Operatore → tutto si svuota e Impostazioni resta ✗ bloccata.
2. **admin (non plus)**: vede la sezione Impostazioni **senza** Utenze (card nascosta + `/impostazioni/utenze` redirige a `/impostazioni`).
3. **operatore con `live` abilitato**: vede "Live" in sidebar e apre `/hub/live` senza redirect. Senza `live`: `/hub/live` redirige a `/hub`.
4. **Anti-lockout**: con un solo admin_plus, prova a declassarlo/eliminarlo → errore "Deve restare almeno un Admin Plus."; sulla propria riga il ruolo è bloccato e "Elimina" è disabilitato.
5. **Niente forzatura**: a un operatore puoi disabilitare `sopralluoghi` e salvarlo (prima era forzato sempre on).

- [ ] **Step 5: Commit finale (se servono fix dalla verifica)**

```bash
git add -A
git commit -m "fix(permessi): correzioni dalla verifica manuale"
```

---

## Self-Review (compilata in fase di scrittura piano)

- **Spec coverage:** ogni regola della tabella moduli → Task 1 (core) + Task 3 (guard) + Task 6 (UI). Utenze=admin_plus → Task 2+4+5. Anti-lockout → Task 2 (server) + Task 6 (UI). roleLabel → Task 4. Promo Live → Task 7. ✓
- **Placeholder scan:** nessun TODO/TBD; codice completo in ogni step. ✓
- **Type consistency:** firma `buildAppMetadataUpdate(currentMetadataRole, currentAllowedModules, requestedRole, requestedModules)` usata coerentemente in `moduleAccess.ts`, test e `users/route.ts`; `ModuleOption` con `requiresAdminRole` allineato tra GET API e `UtenzeClient`; `prefillModulesForRole` usata in UI; `canManageUsers` usata in API + page + home + hotel. ✓
