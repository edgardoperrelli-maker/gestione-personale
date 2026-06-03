export type ValidRole = 'admin' | 'operatore';

/**
 * Ruolo assegnabile dall'area Utenze. `admin_plus` è un super-admin che, oltre
 * ai privilegi admin, vede il cruscotto premialità. A livello di AUTORIZZAZIONE
 * resta "admin" (vedi resolveUserRole + toStoredProfileRole), così tutti i guard
 * e le policy RLS basate su role='admin' continuano a valere senza modifiche.
 * La distinzione "plus" è trasportata in app_metadata.role = 'admin_plus'.
 */
export type AssignableRole = ValidRole | 'admin_plus';

export type AppModuleKey =
  | 'dashboard'
  | 'hotel-calendar'
  | 'rapportini'
  | 'mappa'
  | 'interventi'
  | 'sopralluoghi'
  | 'impostazioni';

export type AppModuleDefinition = {
  key: AppModuleKey;
  href: string;
  label: string;
  description: string;
  section: 'overview' | 'modules' | 'system';
  matchPrefixes?: string[];
  adminOnly?: boolean;
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
    key: 'impostazioni',
    href: '/impostazioni',
    label: 'Impostazioni',
    description: 'Utenze e configurazione accessi',
    section: 'system',
    matchPrefixes: ['/impostazioni'],
    adminOnly: true,
  },
];

export const ALL_MODULE_KEYS = APP_MODULES.map((module) => module.key);

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

/** True per i ruoli con privilegi amministrativi (admin e admin_plus). */
export function isAdminAssignableRole(role: AssignableRole | null | undefined): boolean {
  return role === 'admin' || role === 'admin_plus';
}

export function resolveUserRole(
  profileRole?: string | null,
  metadataRole?: unknown,
): ValidRole {
  // admin_plus è un super-admin: a livello di AUTORIZZAZIONE equivale ad admin.
  // Va riconosciuto anche quando arriva dal solo app_metadata (es. nel middleware,
  // che non legge profiles), altrimenti i super-admin vengono trattati da operatori.
  if (profileRole === 'admin_plus' || metadataRole === 'admin_plus') return 'admin';
  if (isValidRole(profileRole)) return profileRole;
  if (profileRole === 'editor' || profileRole === 'viewer') return 'operatore';
  if (isValidRole(metadataRole)) return metadataRole;
  if (metadataRole === 'editor' || metadataRole === 'viewer') return 'operatore';
  return 'operatore';
}

export function toStoredProfileRole(role: AssignableRole): 'admin' | 'viewer' {
  // admin_plus è admin a livello di profilo/RLS: la tier "plus" vive in app_metadata.
  return isAdminAssignableRole(role) ? 'admin' : 'viewer';
}

export function normalizeAllowedModules(
  input: unknown,
  role?: AssignableRole | null,
): AppModuleKey[] {
  const raw = Array.isArray(input) ? input : DEFAULT_ALLOWED_MODULES;
  const allowed = ALL_MODULE_KEYS.filter((key) => raw.includes(key));

  if (isAdminAssignableRole(role)) {
    return Array.from(new Set<AppModuleKey>([...allowed, 'sopralluoghi', 'impostazioni']));
  }

  return Array.from(new Set<AppModuleKey>([...allowed.filter((key) => key !== 'impostazioni'), 'sopralluoghi']));
}

function extractAppMetadata(value: unknown): { allowedModules?: unknown; role?: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  return value as { allowedModules?: unknown; role?: unknown };
}

export function getAllowedModulesForUser(appMetadata: unknown, role?: AssignableRole | null): AppModuleKey[] {
  const metadata = extractAppMetadata(appMetadata);
  const metadataRole = isAssignableRole(metadata?.role) ? metadata.role : null;
  const effectiveRole = role ?? metadataRole;
  return normalizeAllowedModules(metadata?.allowedModules, effectiveRole);
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
  if (matchedModule.adminOnly && role !== 'admin') return false;
  return allowedModules.includes(matchedModule.key);
}

/**
 * Decisione di accesso usata dal middleware, basata SOLO su `app_metadata`
 * (il middleware non interroga il profilo nel DB). Centralizza la logica così
 * che resti coerente con i guard server-side: in particolare `admin_plus` viene
 * trattato come `admin` (vedi resolveUserRole), evitando il redirect erroneo
 * dei super-admin fuori dalle aree adminOnly come /impostazioni.
 */
export function canAccessPathFromMetadata(pathname: string, appMetadata: unknown): boolean {
  const metadataRole = extractAppMetadata(appMetadata)?.role;
  const role = resolveUserRole(null, metadataRole);
  const allowedModules = getAllowedModulesForUser(appMetadata, role);
  return canAccessPath(pathname, allowedModules, role);
}

/**
 * Costruisce l'app_metadata da salvare in un aggiornamento utente (PATCH Utenze).
 * Quando il ruolo non viene cambiato (`requestedRole` assente) usa il ruolo
 * CORRENTE dell'utente, così aggiornare i soli moduli non lo declassa e i moduli
 * vengono normalizzati sul ruolo reale (non come non-admin).
 */
export function buildAppMetadataUpdate(
  currentMetadataRole: unknown,
  requestedRole: AssignableRole | undefined,
  requestedModules: unknown,
): { role: AssignableRole; allowedModules: AppModuleKey[] } {
  const effectiveRole = requestedRole ?? resolveAssignableRole(undefined, currentMetadataRole);
  return {
    role: effectiveRole,
    allowedModules: normalizeAllowedModules(requestedModules, effectiveRole),
  };
}
