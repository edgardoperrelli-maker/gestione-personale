export type ValidRole = 'admin' | 'operatore';

export type AppModuleKey =
  | 'dashboard'
  | 'hotel-calendar'
  | 'smartracker'
  | 'rapportini'
  | 'mappa'
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

export const APP_MODULES: AppModuleDefinition[] = [
  {
    key: 'dashboard',
    href: '/dashboard',
    label: 'Cronoprogramma',
    description: 'Pianificazione turni e assegnazioni',
    section: 'overview',
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
    key: 'smartracker',
    href: '/hub/smartracker',
    label: 'SmarTracker',
    description: 'Monitoraggio e tracciamento',
    section: 'modules',
    matchPrefixes: ['/hub/smartracker'],
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
    key: 'impostazioni',
    href: '/impostazioni/utenze',
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

export function resolveUserRole(
  profileRole?: string | null,
  metadataRole?: unknown,
): ValidRole {
  if (isValidRole(profileRole)) return profileRole;
  if (profileRole === 'editor' || profileRole === 'viewer') return 'operatore';
  if (isValidRole(metadataRole)) return metadataRole;
  if (metadataRole === 'editor' || metadataRole === 'viewer') return 'operatore';
  return 'operatore';
}

export function toStoredProfileRole(role: ValidRole): 'admin' | 'viewer' {
  return role === 'admin' ? 'admin' : 'viewer';
}

export function normalizeAllowedModules(
  input: unknown,
  role?: ValidRole | null,
): AppModuleKey[] {
  const raw = Array.isArray(input) ? input : DEFAULT_ALLOWED_MODULES;
  const allowed = ALL_MODULE_KEYS.filter((key) => raw.includes(key));

  if (role === 'admin') {
    return Array.from(new Set<AppModuleKey>([...allowed, 'impostazioni']));
  }

  return allowed.filter((key) => key !== 'impostazioni');
}

function extractAppMetadata(value: unknown): { allowedModules?: unknown; role?: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  return value as { allowedModules?: unknown; role?: unknown };
}

export function getAllowedModulesForUser(appMetadata: unknown, role?: ValidRole | null): AppModuleKey[] {
  const metadata = extractAppMetadata(appMetadata);
  const metadataRole = isValidRole(metadata?.role) ? metadata.role : null;
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
