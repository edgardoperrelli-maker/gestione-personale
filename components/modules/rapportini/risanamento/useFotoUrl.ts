'use client';
import { useEffect, useState } from 'react';

/**
 * Risolve il signed URL di una foto (dato il path su storage) sul rapportino pubblico (token).
 * Ritorna null finché non è disponibile o se il path è assente.
 */
export function useFotoUrl(token: string, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let attivo = true;
    setUrl(null);
    fetch(`/api/r/${token}/foto?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { url?: string } | null) => { if (attivo) setUrl(j?.url ?? null); })
      .catch(() => { if (attivo) setUrl(null); });
    return () => { attivo = false; };
  }, [token, path]);
  return url;
}
