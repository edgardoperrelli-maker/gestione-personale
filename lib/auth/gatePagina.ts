import 'server-only';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { canAccessPathFromMetadata, findModuleByPath } from '@/lib/moduleAccess';

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
 */
export async function gatePagina(percorso: string): Promise<void> {
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
}
