import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** Stessa chiave della cache client (geocodingCache.ts) → cache condivisa. */
function buildKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function getCachedCoordsServer(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('geocoding_cache')
      .select('lat, lng')
      .eq('lookup_key', buildKey(indirizzo, cap, citta))
      .maybeSingle();
    return data ? { lat: data.lat, lng: data.lng } : null;
  } catch {
    return null; // silenzioso: un errore cache non blocca la geocodifica
  }
}

export async function saveResolvedCoordsServer(
  indirizzo: string,
  cap: string,
  citta: string,
  lat: number,
  lng: number,
): Promise<void> {
  try {
    await supabaseAdmin.from('geocoding_cache').upsert(
      {
        lookup_key: buildKey(indirizzo, cap, citta),
        indirizzo_raw: indirizzo,
        cap_raw: cap,
        citta_raw: citta,
        lat,
        lng,
      },
      { onConflict: 'lookup_key' },
    );
  } catch {
    // silenzioso
  }
}
