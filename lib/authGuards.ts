/**
 * Security guards for authentication flows.
 *
 * Note: All users have fake @local.it emails.
 * Email-based password recovery is not supported.
 * Use the admin interface at /impostazioni/utenti for password resets.
 */

/**
 * This function MUST NEVER be called.
 * All users have fake @local.it emails, so email-based recovery is impossible.
 * Password reset is handled via the admin interface only.
 *
 * @throws {Error} Always throws with helpful error message
 */
export function resetPasswordForEmail(): never {
  throw new Error(
    '[gestione-personale] resetPasswordForEmail() is disabled. ' +
    'All users have fake @local.it emails. ' +
    'Use the admin password reset at /impostazioni/utenti instead.'
  );
}
