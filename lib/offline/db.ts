import type { OutboxItem, Snapshot, LavoroVoce } from './types';

const DB_NAME = 'rapportini-offline';
const DB_VERSION = 1;
const STORE_SNAPSHOT = 'snapshot';
const STORE_LAVORO = 'lavoro';
const STORE_OUTBOX = 'outbox';
const STORE_BLOB = 'blob';

function apriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) db.createObjectStore(STORE_SNAPSHOT, { keyPath: 'token' });
      if (!db.objectStoreNames.contains(STORE_LAVORO)) db.createObjectStore(STORE_LAVORO, { keyPath: 'chiave' });
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const s = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        s.createIndex('per_token', 'token', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOB)) db.createObjectStore(STORE_BLOB, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return apriDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let risultato: T;
        const req = fn(t.objectStore(store));
        req.onsuccess = () => {
          risultato = req.result;
        };
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve(risultato);
        t.onabort = () => reject(t.error ?? new Error('transazione annullata'));
        t.onerror = () => reject(t.error ?? req.error);
      }),
  );
}

function tutti<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

/* ── Snapshot ─────────────────────────────────────────────────────────────── */
export const dbSnapshot = {
  salva: (snap: Snapshot) => tx(STORE_SNAPSHOT, 'readwrite', (s) => s.put(snap)),
  leggi: (token: string) => tx<Snapshot | undefined>(STORE_SNAPSHOT, 'readonly', (s) => s.get(token) as IDBRequest<Snapshot | undefined>),
};

/* ── Lavoro (risposte locali per voce) ────────────────────────────────────── */
export const dbLavoro = {
  salva: (l: LavoroVoce) => tx(STORE_LAVORO, 'readwrite', (s) => s.put(l)),
  perToken: async (token: string): Promise<LavoroVoce[]> => {
    const all = await tutti<LavoroVoce>(STORE_LAVORO);
    return all.filter((l) => l.token === token);
  },
  rimuovi: (chiave: string) => tx(STORE_LAVORO, 'readwrite', (s) => s.delete(chiave)),
};

/* ── Outbox ───────────────────────────────────────────────────────────────── */
export const dbOutbox = {
  tutti: () => tutti<OutboxItem>(STORE_OUTBOX),
  perToken: async (token: string): Promise<OutboxItem[]> => {
    const all = await tutti<OutboxItem>(STORE_OUTBOX);
    return all.filter((i) => i.token === token);
  },
  put: (item: OutboxItem) => tx(STORE_OUTBOX, 'readwrite', (s) => s.put(item)),
  rimuovi: (id: string) => tx(STORE_OUTBOX, 'readwrite', (s) => s.delete(id)),
};

/* ── Blob foto ────────────────────────────────────────────────────────────── */
export const dbBlob = {
  salva: (id: string, blob: Blob) => tx(STORE_BLOB, 'readwrite', (s) => s.put({ id, blob })),
  leggi: async (id: string): Promise<Blob | undefined> => {
    const r = await tx<{ id: string; blob: Blob } | undefined>(STORE_BLOB, 'readonly', (s) => s.get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>);
    return r?.blob;
  },
  rimuovi: (id: string) => tx(STORE_BLOB, 'readwrite', (s) => s.delete(id)),
};

/** Disponibilità di IndexedDB (false in SSR o browser senza supporto). */
export function indexedDbDisponibile(): boolean {
  return typeof indexedDB !== 'undefined';
}
