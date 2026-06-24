// Verifica di ESISTENZA byte-aware: createSignedUrl fallisce quando l'oggetto non esiste
// davvero nel bucket (riga storage.objects assente). Più affidabile di .list() per
// rilevare la cancellazione, ed è lo stesso meccanismo del percorso di lettura del pannello.
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** PURA: i path attesi che NON risultano presenti. */
export function pathMancanti(attesi: string[], presenti: Set<string>): string[] {
  return attesi.filter((p) => !presenti.has(p));
}

/** Server: insieme dei path il cui oggetto è realmente firmabile (= esiste). */
export async function fotoPresentiVerificate(paths: string[]): Promise<Set<string>> {
  const presenti = new Set<string>();
  await Promise.all(
    paths.map(async (p) => {
      const { data, error } = await supabaseAdmin.storage.from('interventi-foto').createSignedUrl(p, 60);
      if (!error && data?.signedUrl) presenti.add(p);
    }),
  );
  return presenti;
}
