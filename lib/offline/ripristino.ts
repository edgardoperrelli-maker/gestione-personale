/**
 * Ripristino dello stato locale di un'installazione PWA "impantanata".
 *
 * Caso reale: su un dispositivo lo stato offline si corrompe (un vecchio bundle servito dalla
 * cache, un service worker in stato incoerente) e l'app non riesce più a sincronizzare, mentre in
 * navigazione anonima — dove non c'è nulla di persistito — tutto funziona. Questo azzera le cache
 * del CODICE (Cache API) e il service worker, così al reload l'app riscarica tutto fresco dalla
 * rete, come una prima apertura.
 *
 * NON tocca IndexedDB (snapshot/coda/foto): i dati di lavoro non inviati NON si perdono qui. La
 * rimozione dei singoli elementi "da risolvere" resta esplicita e separata (pulsante "Rimuovi").
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
