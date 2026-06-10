import { randomUUID } from 'crypto';

/** Sanifica il clientKey: tiene solo [a-zA-Z0-9-_]. */
function sanifica(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Path di storage idempotente per la foto di campo. Con `clientKey` presente il
 * path è deterministico → un re-invio (upsert) sovrascrive lo stesso file invece
 * di crearne uno nuovo. Senza clientKey, fallback a UUID casuale (comportamento legacy).
 */
export function nomeFileFoto(rapId: string, clientKey: string | undefined, ext: string): string {
  const base = clientKey && sanifica(clientKey) ? sanifica(clientKey) : randomUUID();
  return `rapportini/${rapId}/${base}.${ext}`;
}
