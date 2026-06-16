import { dbBlob, dbOutbox, indexedDbDisponibile } from './db';
import { costruisciManualeOutbox } from './manualeOutbox';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';

export type DatiManualeOffline = {
  committente: CommittenteManuale;
  anagrafica: Record<string, unknown>;
  risposte: Record<string, unknown>;
  note?: string | null;
  parentVoceId?: string | null;
  /** Foto per slot: chiave campo → File scelto. */
  fotoFiles: Record<string, File>;
};

/**
 * Accoda una richiesta manuale ("+") offline-first: salva i blob foto in IndexedDB e
 * mette in coda l'item `manuale` (idempotente per `richiestaId`). L'invio è poi gestito
 * dal ramo `manuale` di `lib/offline/sync.ts` (online subito, oppure alla sync).
 * Best-effort: ritorna null se IndexedDB/crypto non sono disponibili (il chiamante
 * ripiega sul fetch online). NON lancia mai: i dati di campo non si perdono.
 */
export async function accodaManuale(
  token: string,
  dati: DatiManualeOffline,
  now: number,
): Promise<{ richiestaId: string } | null> {
  if (!indexedDbDisponibile() || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    return null;
  }
  try {
    const richiestaId = crypto.randomUUID();
    const fotoBlobRefs: Array<{ chiave: string; blobId: string }> = [];
    for (const [chiave, file] of Object.entries(dati.fotoFiles)) {
      const blobId = crypto.randomUUID();
      await dbBlob.salva(blobId, file);
      fotoBlobRefs.push({ chiave, blobId });
    }
    const item = costruisciManualeOutbox(
      token,
      {
        richiestaId,
        committente: dati.committente,
        anagrafica: dati.anagrafica,
        risposte: dati.risposte,
        note: dati.note ?? null,
        parentVoceId: dati.parentVoceId ?? null,
        fotoBlobRefs,
      },
      now,
    );
    await dbOutbox.put(item);
    return { richiestaId };
  } catch {
    return null;
  }
}
