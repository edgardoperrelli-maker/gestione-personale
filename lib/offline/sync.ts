import { dbOutbox, dbBlob, dbLavoro, indexedDbDisponibile } from './db';
import { ordineInvio, classificaEsito } from './syncPlan';
import { marcaErrore } from './outboxModel';
import type { OutboxItem } from './types';

let inCorso = false;

/** Esegue l'invio HTTP di un singolo elemento; restituisce lo status (0 = errore rete). */
async function inviaElemento(item: OutboxItem): Promise<number> {
  try {
    if (item.type === 'voce') {
      const r = await fetch(`/api/r/${item.token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: item.payload.voceId, risposte: item.payload.risposte }),
      });
      return r.status;
    }
    if (item.type === 'agenda') {
      const r = await fetch(`/api/agenda/${item.token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      return r.status;
    }
    if (item.type === 'foto') {
      const blob = await dbBlob.leggi(item.payload.blobId);
      if (!blob) return 200; // blob già caricato/rimosso: trattalo come completato
      const fd = new FormData();
      fd.append('file', blob, `${item.payload.clientKey}.jpg`);
      fd.append('clientKey', item.payload.clientKey);
      const r = await fetch(`/api/r/${item.token}/foto-campo`, { method: 'POST', body: fd });
      if (r.ok) {
        const { path } = (await r.json()) as { path?: string };
        if (path) {
          // riscrive il path reale nelle risposte locali della voce
          const lavori = await dbLavoro.perToken(item.token);
          const lavoro = lavori.find((l) => l.voceId === item.payload.voceId);
          const risposte = { ...(lavoro?.risposte ?? {}), [item.payload.chiave]: path };
          await dbLavoro.salva({ chiave: `${item.token}:${item.payload.voceId}`, token: item.token, voceId: item.payload.voceId, risposte, aggiornatoIl: Date.now() });
          // accoda/aggiorna il salvataggio della voce con il path reale
          await dbOutbox.put({ id: `voce-${item.token}-${item.payload.voceId}`, type: 'voce', token: item.token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: { voceId: item.payload.voceId, risposte } });
        }
        await dbBlob.rimuovi(item.payload.blobId);
      }
      return r.status;
    }
    if (item.type === 'manuale') {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({
        richiestaId: item.payload.richiestaId,
        committente: item.payload.committente,
        anagrafica: item.payload.anagrafica,
        risposte: item.payload.risposte,
        note: item.payload.note ?? null,
      }));
      for (const ref of item.payload.fotoBlobRefs) {
        const blob = await dbBlob.leggi(ref.blobId);
        if (blob) fd.append(`foto:${ref.chiave}`, blob, `${ref.chiave}.jpg`);
      }
      const r = await fetch(`/api/r/${item.token}/intervento-manuale`, { method: 'POST', body: fd });
      if (r.ok) {
        for (const ref of item.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
      }
      return r.status;
    }
    // invia
    const r = await fetch(`/api/r/${item.token}/invia`, { method: 'POST' });
    return r.status;
  } catch {
    return 0; // errore di rete
  }
}

/** Sincronizza tutta la coda di un token. Ritorna true se la coda è vuota a fine giro. */
export async function sincronizzaToken(token: string): Promise<boolean> {
  if (!indexedDbDisponibile() || inCorso) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  inCorso = true;
  try {
    const items = (await dbOutbox.perToken(token)).filter((i) => i.stato !== 'bloccato');
    const ordinati = ordineInvio(items);
    for (const item of ordinati) {
      await dbOutbox.put({ ...item, stato: 'in_invio' });
      const status = await inviaElemento(item);
      const esito = classificaEsito(status);
      if (esito.esito === 'completato') {
        await dbOutbox.rimuovi(item.id);
      } else if (esito.esito === 'bloccato') {
        await dbOutbox.put({ ...item, stato: 'bloccato', ultimoErrore: esito.motivo });
      } else {
        await dbOutbox.put(marcaErrore(item, 'rete'));
        break; // errore di rete: interrompi, ritenta al trigger successivo
      }
    }
    const restanti = (await dbOutbox.perToken(token)).filter((i) => i.stato !== 'bloccato');
    return restanti.length === 0;
  } finally {
    inCorso = false;
  }
}

/**
 * Registra i trigger di sincronizzazione automatica per un token e restituisce
 * una funzione di cleanup. Trigger: online, ritorno in primo piano, intervallo.
 */
export function avviaSyncAutomatica(token: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => { void sincronizzaToken(token); };
  const onVisibile = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisibile);
  const intervallo = window.setInterval(run, 30000);
  run(); // tentativo immediato
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisibile);
    window.clearInterval(intervallo);
  };
}
