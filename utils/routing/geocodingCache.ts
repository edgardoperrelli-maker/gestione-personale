'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

function buildKey(indirizzo: string, cap: string, citta: string): string {
  return `${indirizzo}|${cap}|${citta}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cerca nella cache DB le coordinate di un indirizzo corretto manualmente.
 * Restituisce {lat, lng} oppure null.
 *
 * Nota: un errore DB non blocca il flusso — torna null e la geocodifica continua.
 */
export async function getCachedCoords(
  indirizzo: string,
  cap: string,
  citta: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const supabase = createClientComponentClient();
    const { data } = await supabase
      .from('geocoding_cache')
      .select('lat, lng')
      .eq('lookup_key', buildKey(indirizzo, cap, citta))
      .maybeSingle();
    return data ? { lat: data.lat, lng: data.lng } : null;
  } catch {
    return null; // silenzioso: il DB offline non deve bloccare la mappa
  }
}

/**
 * Salva una correzione manuale nel DB.
 * Usa upsert: se la chiave esiste già, aggiorna le coordinate.
 *
 * Nota: un errore DB è silenzioso — la mappa funziona comunque.
 */
export async function saveManualCorrection(
  indirizzo: string,
  cap: string,
  citta: string,
  lat: number,
  lng: number,
): Promise<void> {
  try {
    const supabase = createClientComponentClient();
    await supabase.from('geocoding_cache').upsert(
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
    // silenzioso: la mappa funziona anche senza cache DB
  }
}
