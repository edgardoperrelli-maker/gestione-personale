import { dbBlob, dbOutbox, indexedDbDisponibile } from './db';
import { placeholderFoto, blobIdDaPlaceholder } from './fotoPlaceholder';

/** Id deterministico dell'elemento outbox foto per (token, voce, campo): una foto per campo. */
function idFoto(token: string, voceId: string, chiave: string): string {
  return `foto:${token}:${voceId}:${chiave}`;
}

/**
 * Accoda una foto offline: salva il blob, accoda l'elemento `foto` (clientKey univoco)
 * e restituisce il placeholder da scrivere nella risposta del campo. Se per quel campo
 * c'era già una foto in coda non ancora caricata, la sostituisce (retake) rimuovendo il
 * blob precedente. Best-effort: ritorna null se IndexedDB non è disponibile.
 */
export async function accodaFoto(
  token: string,
  voceId: string,
  chiave: string,
  blob: Blob,
  now: number,
): Promise<string | null> {
  if (!indexedDbDisponibile()) return null;
  try {
    const id = idFoto(token, voceId, chiave);
    const esistenti = await dbOutbox.perToken(token);
    const prior = esistenti.find((i) => i.id === id && i.type === 'foto');
    if (prior && prior.type === 'foto') {
      await dbBlob.rimuovi(prior.payload.blobId);
    }
    const blobId = crypto.randomUUID();
    const clientKey = crypto.randomUUID();
    await dbBlob.salva(blobId, blob);
    await dbOutbox.put({
      id, type: 'foto', token, createdAt: now, tentativi: 0, stato: 'in_attesa',
      payload: { voceId, chiave, blobId, clientKey },
    });
    return placeholderFoto(blobId);
  } catch {
    return null;
  }
}

/** Legge il blob locale di una foto a partire dal suo placeholder (per l'anteprima). */
export async function leggiBlobFoto(placeholder: unknown): Promise<Blob | undefined> {
  const blobId = blobIdDaPlaceholder(placeholder);
  if (!blobId || !indexedDbDisponibile()) return undefined;
  try {
    return await dbBlob.leggi(blobId);
  } catch {
    return undefined;
  }
}
