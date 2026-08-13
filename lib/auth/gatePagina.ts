import 'server-only';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import {
  canAccessPathFromMetadata, canManageUsers, findModuleByPath, resolveAssignableRole,
  type AssignableRole,
} from '@/lib/moduleAccess';

/**
 * Quel che la pagina sa di chi è entrato, una volta passato il cancello.
 *
 * `adminPlus` è il privilegio «in più» (Utenze, premialità, correzione dello Storico): serve
 * alle viste che offrono un gesto riservato, e averlo qui evita a ogni pagina una seconda
 * `auth.getUser()` per una domanda a cui la sessione appena letta risponde già.
 */
export type EsitoGate = { ruolo: AssignableRole; adminPlus: boolean };

/**
 * Cancello di pagina per una vista di modulo: sessione + permesso, in una riga.
 *
 * Usa `canAccessPathFromMetadata`, cioè ESATTAMENTE la funzione che decide nel middleware.
 * È il punto: non due controlli che si somigliano, uno solo chiamato da due posti. Se un
 * domani il `matcher` del middleware cambia — o una rotta finisce fuori dai suoi prefissi —
 * la pagina continua a difendersi da sola, e lo fa con lo stesso verdetto.
 *
 * Il percorso si passa a mano perché un Server Component non conosce la propria URL. Da qui
 * il controllo sotto: un percorso che non corrisponde a NESSUN modulo non è una pagina
 * libera, è un refuso — e `canAccessPath` su un percorso sconosciuto risponde «passa».
 * Senza questa riga, sbagliare a scrivere la stringa spalancherebbe la porta invece di
 * chiuderla, che è il modo peggiore in cui può fallire un cancello.
 *
 * Restituisce il ruolo di chi è passato (`EsitoGate`). Chi non ne ha bisogno continua a
 * chiamarlo con un `await` nudo, come prima: è un valore in più, non un contratto nuovo.
 * Il ruolo si legge dai SOLI `app_metadata`, cioè dalla stessa sorgente su cui ha appena
 * deciso `canAccessPathFromMetadata` — leggerlo anche da `profiles` qui aprirebbe la porta a
 * due verdetti diversi nella stessa funzione, che è il difetto curato il 03/08.
 */
export async function gatePagina(percorso: string): Promise<EsitoGate> {
  if (!findModuleByPath(percorso)) {
    console.error(`[gatePagina] percorso senza modulo: "${percorso}" — refuso? La pagina resta chiusa.`);
    redirect('/hub');
  }

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!canAccessPathFromMetadata(percorso, user.app_metadata)) redirect('/hub');

  const ruolo = resolveAssignableRole(undefined, user.app_metadata?.role);
  return { ruolo, adminPlus: canManageUsers(ruolo) };
}
