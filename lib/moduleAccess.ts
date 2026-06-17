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
  | 'appuntamenti'
  | 'misuratori'
  | 'agente'
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
  /** Gate FORTE di ruolo: l'accesso richiede ruolo admin. Es. `impostazioni`, `agente`. */
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
    key: 'appuntamenti',
    href: '/hub/appuntamenti',
    label: 'Appuntamenti',
    description: 'Gestione e pianificazione appuntamenti',
    section: 'modules',
    matchPrefixes: ['/hub/appuntamenti'],
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
    key: 'agente',
    href: '/hub/agente',
    label: 'Agente',
    description: 'Pianificazione e feedback sync limitazioni massive',
    section: 'modules',
    matchPrefixes: ['/hub/agente'],
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
  if (matchedModule.requiresAdminRole && role !== 'admin') return false; // gate di ruolo forte
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
  const modulesInput =
    Array.isArray(requestedModules) ? requestedModules :
    Array.isArray(currentAllowedModules) ? currentAllowedModules :
    prefillModulesForRole(effectiveRole);
  return {
    role: effectiveRole,
    allowedModules: normalizeAllowedModules(modulesInput, effectiveRole),
  };
}
