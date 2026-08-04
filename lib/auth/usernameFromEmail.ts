// PURE: normalizzazione dello username applicativo e dell'email finta di login.
// Gli accessi sono nel formato `u_<username>@local.it` (legacy: `@local`).
// Unica sorgente dello schema: la usano l'area Utenze (/api/admin/users), le
// credenziali del personale (/api/admin/personale/credenziali) e il login.

const LOCAL_DOMAIN = '@local.it';
const LEGACY_LOCAL_DOMAIN = '@local';

/**
 * Username "nudo": trim + minuscole, senza dominio finto ne' prefisso `u_`.
 * Accetta sia uno username digitato che un'email completa (idempotente).
 */
export function normalizeUsername(value: string): string {
  const t = value.trim().toLowerCase();
  const withoutDomain =
    t.endsWith(LOCAL_DOMAIN) ? t.slice(0, -LOCAL_DOMAIN.length) :
    t.endsWith(LEGACY_LOCAL_DOMAIN) ? t.slice(0, -LEGACY_LOCAL_DOMAIN.length) :
    t;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

/** `Francesco.Marian` → `u_francesco.marian@local.it` (normalizza prima). */
export function toEmail(username: string): string {
  return `u_${normalizeUsername(username)}${LOCAL_DOMAIN}`;
}

/** `u_francesco.marian@local.it` → `francesco.marian`. Stringa vuota se assente. */
export function usernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  return normalizeUsername(email);
}
