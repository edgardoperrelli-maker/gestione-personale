import 'server-only';
import { createHmac } from 'crypto';

/**
 * ID di sessione di assistenza, derivato dal token del rapportino con HMAC.
 *
 * Sicurezza: il nome del canale Realtime NON deve essere il token grezzo né derivabile
 * da chi possiede solo la anon key. Il `sessionId` si calcola SOLO lato server (questa
 * funzione è `server-only`) e viaggia verso il client già pronto: la pagina operatore
 * (server component) lo incorpora, l'admin lo riceve da un endpoint `requireAdmin`.
 * Così il canale `assist:<sessionId>` è raggiungibile solo da chi è stato autorizzato
 * a conoscere il token (operatore col link, admin col DB).
 */
const SECRET =
  process.env.ASSIST_CHANNEL_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'assist-dev-secret-change-me';

export function sessionId(token: string): string {
  return createHmac('sha256', SECRET).update(`assist:${token}`).digest('hex').slice(0, 32);
}
