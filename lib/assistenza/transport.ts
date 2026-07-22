'use client';

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Trasporto realtime per l'assistenza (co-browsing). Supabase Realtime **broadcast** +
 * presence: pub/sub EFFIMERO, nessuna scrittura di dati rapportino sul database.
 *
 * - Un canale per sessione: `assist:<sessionId>` (sessionId = HMAC del token, calcolato server-side).
 * - Un canale "lobby" per le richieste operatore→backoffice: `LOBBY`.
 * - Gli eventi rrweb (potenzialmente > 256KB al full-snapshot) vengono spezzati in chunk e
 *   riassemblati lato ricevente (limite broadcast di Supabase).
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
export type Hint = { text: string };
type Chunk = { eid: string; i: number; n: number; s: string };

const CHUNK_SIZE = 180_000; // margine sotto il limite ~256KB del broadcast

/** Spezza un evento rrweb in chunk e li invia sul canale. */
export function inviaEvento(ch: RealtimeChannel, event: unknown, seq: { n: number }): void {
  const s = JSON.stringify(event);
  const n = Math.max(1, Math.ceil(s.length / CHUNK_SIZE));
  const eid = `${(seq.n += 1).toString(36)}-${Date.now().toString(36)}`;
  for (let i = 0; i < n; i += 1) {
    const chunk: Chunk = { eid, i, n, s: s.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) };
    ch.send({ type: 'broadcast', event: 'rr', payload: chunk });
  }
}

/** Ricevitore che riassembla i chunk e richiama `onEvent` con l'evento rrweb completo. */
export function creaRicevitore(onEvent: (event: unknown) => void): (payload: Chunk) => void {
  const buf = new Map<string, { n: number; parts: string[]; got: number }>();
  return (p: Chunk) => {
    let b = buf.get(p.eid);
    if (!b) {
      b = { n: p.n, parts: new Array(p.n), got: 0 };
      buf.set(p.eid, b);
    }
    if (b.parts[p.i] === undefined) {
      b.parts[p.i] = p.s;
      b.got += 1;
    }
    if (b.got === b.n) {
      buf.delete(p.eid);
      try {
        onEvent(JSON.parse(b.parts.join('')));
      } catch {
        /* evento corrotto: ignora */
      }
    }
  };
}
