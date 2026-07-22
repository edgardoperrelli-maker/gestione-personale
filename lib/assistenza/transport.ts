'use client';

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Trasporto realtime per l'assistenza (co-browsing). Supabase Realtime **broadcast** +
 * presence: pub/sub EFFIMERO, nessuna scrittura di dati rapportino sul database.
 *
 * Percorso eventi rrweb (il full-snapshot di un rapportino reale — 100+ voci + CSS
 * inlinato — può superare il MB, e il broadcast di Supabase scarta i messaggi oltre
 * il limite di payload ~256KB):
 *   JSON → gzip (CompressionStream) → base64 → chunk ≤ 120KB → broadcast.
 * Il gzip riduce ~10× (il grosso è CSS/markup ripetitivo) e il base64 non subisce
 * inflazione da escape JSON (nessuna virgoletta/backslash). L'invio è SEQUENZIALE
 * (coda di promise) per preservare l'ordine degli eventi; ogni chunk controlla
 * l'esito di `send` e ritenta una volta sui drop.
 */

let _client: SupabaseClient | null = null;

/** Client realtime condiviso (anon key). `null` se le env pubbliche mancano. */
export function realtimeClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 40 } },
  });
  return _client;
}

export const LOBBY = 'assist-richieste';
export const canaleSessione = (sessionId: string) => `assist:${sessionId}`;

export type Richiesta = { sid: string; staff: string; data: string; at: number };
/** Chunk sul filo: `z=1` payload gzip+base64, `z=0` JSON in chiaro (fallback). */
export type Chunk = { eid: string; i: number; n: number; s: string; z: 0 | 1 };

const CHUNK_SIZE = 120_000; // base64: 120KB chars = 120KB bytes, ampio margine sotto il limite

/* ── compressione (pura, testabile: CompressionStream esiste anche in Node 18+) ── */

export async function comprimi(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function decomprimi(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** Spezza una stringa in chunk numerati (puro, per i test). */
export function spezza(s: string, eid: string, z: 0 | 1, size = CHUNK_SIZE): Chunk[] {
  const n = Math.max(1, Math.ceil(s.length / size));
  const out: Chunk[] = [];
  for (let i = 0; i < n; i += 1) out.push({ eid, i, n, s: s.slice(i * size, (i + 1) * size), z });
  return out;
}

/* ── invio (coda sequenziale per-canale, retry sui drop) ── */

export type EsitoInvio = { inviati: number; persi: number };

export function creaMittente(ch: RealtimeChannel, onDrop?: () => void) {
  let coda: Promise<void> = Promise.resolve();
  let seq = 0;
  const esito: EsitoInvio = { inviati: 0, persi: 0 };

  const sendChunk = async (chunk: Chunk): Promise<void> => {
    const res = await ch.send({ type: 'broadcast', event: 'rr', payload: chunk }).catch(() => 'error' as const);
    if (res !== 'ok') {
      // un solo retry: su drop persistente segnala (l'operatore vede "connessione instabile")
      const retry = await ch.send({ type: 'broadcast', event: 'rr', payload: chunk }).catch(() => 'error' as const);
      if (retry !== 'ok') {
        esito.persi += 1;
        onDrop?.();
        return;
      }
    }
    esito.inviati += 1;
  };

  return {
    esito,
    invia(event: unknown): void {
      seq += 1;
      const eid = `${seq.toString(36)}-${Date.now().toString(36)}`;
      coda = coda.then(async () => {
        const json = JSON.stringify(event);
        let chunks: Chunk[];
        try {
          if (typeof CompressionStream !== 'undefined') {
            chunks = spezza(await comprimi(json), eid, 1);
          } else {
            chunks = spezza(json, eid, 0);
          }
        } catch {
          chunks = spezza(json, eid, 0);
        }
        for (const c of chunks) await sendChunk(c);
      }).catch(() => { /* la coda non si deve mai rompere */ });
    },
  };
}

/* ── ricezione (riassembla i chunk, decomprime, preserva l'ordine) ── */

export function creaRicevitore(onEvent: (event: unknown) => void): (payload: Chunk) => void {
  const buf = new Map<string, { n: number; parts: string[]; got: number; z: 0 | 1 }>();
  let coda: Promise<void> = Promise.resolve();
  return (p: Chunk) => {
    let b = buf.get(p.eid);
    if (!b) {
      b = { n: p.n, parts: new Array<string>(p.n), got: 0, z: p.z };
      buf.set(p.eid, b);
    }
    if (b.parts[p.i] === undefined) {
      b.parts[p.i] = p.s;
      b.got += 1;
    }
    if (b.got === b.n) {
      buf.delete(p.eid);
      const intero = b.parts.join('');
      const z = b.z;
      // coda sequenziale: la decompressione è async, non deve riordinare gli eventi
      coda = coda.then(async () => {
        try {
          const json = z === 1 ? await decomprimi(intero) : intero;
          onEvent(JSON.parse(json));
        } catch {
          /* evento corrotto: ignora */
        }
      });
    }
  };
}
