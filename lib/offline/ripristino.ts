import { dbOutbox, dbBlob } from './db';
import type { OutboxItem } from './types';

/**
 * Ripristino dello stato locale di un'installazione PWA "impantanata".
 *
 * Caso reale: su un dispositivo lo stato offline si corrompe (un vecchio bundle servito dalla
 * cache, un service worker in stato incoerente) e l'app non riesce più a sincronizzare, mentre in
 * navigazione anonima — dove non c'è nulla di persistito — tutto funziona. Questo azzera le cache
 * del CODICE (Cache API) e il service worker, così al reload l'app riscarica tutto fresco dalla
 * rete, come una prima apertura.
 *
 * NON tocca l'IndexedDB dei dati validi: i dati di lavoro non inviati NON si perdono qui.
 * Best-effort: ogni passo è protetto, non lancia mai.
 */
export async function svuotaCacheApp(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const chiavi = await caches.keys();
      await Promise.all(chiavi.map((k) => caches.delete(k)));
    }
  } catch {
    /* best-effort: se la Cache API non è disponibile o nega, proseguiamo */
  }
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best-effort: l'unregister può fallire su alcuni browser, non è bloccante */
  }
}

/** Rimuove un elemento della coda e i suoi blob foto (per non lasciare orfani in IndexedDB). */
export async function rimuoviItemEBlob(it: OutboxItem): Promise<void> {
  if (it.type === 'manuale') {
    for (const ref of it.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
  } else if (it.type === 'foto') {
    await dbBlob.rimuovi(it.payload.blobId);
  }
  await dbOutbox.rimuovi(it.id);
}

/**
 * Ripristino completo "come navigazione anonima": elimina gli elementi bloccati passati (con i loro
 * blob) e azzera cache + service worker. NON tocca gli elementi validi ancora in coda. Il reload
 * resta a carico del chiamante (subito dopo), così la pagina riparte pulita.
 */
export async function ripristinaApp(bloccati: OutboxItem[] = []): Promise<void> {
  for (const it of bloccati) await rimuoviItemEBlob(it);
  await svuotaCacheApp();
}
