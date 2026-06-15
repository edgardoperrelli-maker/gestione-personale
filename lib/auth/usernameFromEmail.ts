// PURA: ricava lo username applicativo dall'email finta usata per il login.
// Gli accessi sono nel formato `u_<username>@local.it` (legacy: `@local`).
// Stesso schema di normalizzazione usato in app/api/admin/users e nel login.

const LOCAL_DOMAIN = '@local.it';
const LEGACY_LOCAL_DOMAIN = '@local';

/** `u_francesco.marian@local.it` → `francesco.marian`. Stringa vuota se assente. */
export function usernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const t = email.trim().toLowerCase();
  const withoutDomain =
    t.endsWith(LOCAL_DOMAIN) ? t.slice(0, -LOCAL_DOMAIN.length) :
    t.endsWith(LEGACY_LOCAL_DOMAIN) ? t.slice(0, -LEGACY_LOCAL_DOMAIN.length) :
    t;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}
