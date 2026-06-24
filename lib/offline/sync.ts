import { dbOutbox, dbBlob, dbLavoro, indexedDbDisponibile } from './db';
import { ordineInvio, classificaEsito, modoInvioManuale, esitoInvioManuale } from './syncPlan';
import { marcaErrore } from './outboxModel';
import { idOutboxVoce } from './ids';
import { inviaRitentabile } from './inviaRitentabile';
import type { OutboxItem } from './types';

let inCorso = false;

/** Esegue l'invio HTTP di un singolo elemento; restituisce lo status (0 = errore rete). */
async function inviaElemento(item: OutboxItem): Promise<{ status: number; ritentabile?: boolean; differita?: boolean }> {
  try {
    if (item.type === 'voce') {
      // Le risposte CORRENTI stanno in dbLavoro: il ramo foto vi riscrive il path reale dopo
      // l'upload, mentre l'item in coda (snapshot) può avere ancora i placeholder `blob-locale:`.
      // Inviamo SEMPRE dbLavoro così il server riceve i path reali delle foto, non i segnaposto.
      const lavori = await dbLavoro.perToken(item.token);
      const lavoro = lavori.find((l) => l.voceId === item.payload.voceId);
      const risposte = lavoro?.risposte ?? item.payload.risposte;
      // taskId (chiave stabile): se il rapportino è stato rigenerato dall'ufficio l'`id` della
      // voce è cambiato → il server ripiega su task_id per riagganciare il salvataggio.
      const taskId = lavoro?.taskId ?? item.payload.taskId;
      const r = await fetch(`/api/r/${item.token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: item.payload.voceId, taskId, risposte }),
      });
      return { status: r.status };
    }
    if (item.type === 'agenda') {
      const r = await fetch(`/api/agenda/${item.token}/intervento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      return { status: r.status };
    }
    if (item.type === 'foto') {
      const blob = await dbBlob.leggi(item.payload.blobId);
      if (!blob) return { status: 200 }; // blob già caricato/rimosso: trattalo come completato

      // 1) Chiamata di rete (un suo fallimento è errore di rete → 0 → ritenta).
      let status = 0;
      let path: string | undefined;
      try {
        const fd = new FormData();
        fd.append('file', blob, `${item.payload.clientKey}.jpg`);
        fd.append('clientKey', item.payload.clientKey);
        const r = await fetch(`/api/r/${item.token}/foto-campo`, { method: 'POST', body: fd });
        status = r.status;
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as { path?: string };
          path = j.path;
        }
      } catch {
        return { status: 0 }; // errore di rete
      }

      // 2) Bookkeeping locale best-effort: un fallimento QUI non deve far ritentare la
      //    rete (la foto è già su storage). L'item foto verrà comunque rimosso (completato).
      if (status >= 200 && status < 300) {
        try {
          if (path) {
            const lavori = await dbLavoro.perToken(item.token);
            const lavoro = lavori.find((l) => l.voceId === item.payload.voceId);
            const taskId = lavoro?.taskId; // preserva la chiave stabile per il riaggancio lato server
            const risposte = { ...(lavoro?.risposte ?? {}), [item.payload.chiave]: path };
            await dbLavoro.salva({ chiave: `${item.token}:${item.payload.voceId}`, token: item.token, voceId: item.payload.voceId, taskId, risposte, aggiornatoIl: Date.now() });
            // Ri-accoda il salvataggio della voce col path reale, usando l'id canonico
            // (così coincide con la voce accodata dal form → coalescing via chiave IndexedDB).
            await dbOutbox.put({ id: idOutboxVoce(item.token, item.payload.voceId), type: 'voce', token: item.token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: { voceId: item.payload.voceId, risposte, taskId } });
          }
          await dbBlob.rimuovi(item.payload.blobId);
        } catch {
          /* bookkeeping locale fallito: non ritentiamo la rete; l'item foto sarà rimosso */
        }
      }
      return { status };
    }
    if (item.type === 'manuale') {
      const now = Date.now();
      const modo = modoInvioManuale(item, now);
      if (modo === 'attendi') {
        // Non ancora ora di confermare: ripristina lo stato (il loop l'ha messo 'in_invio')
        // e segnala 'differita' → il loop prosegue con gli altri item, senza errore né break.
        await dbOutbox.put({ ...item, stato: 'in_attesa' });
        return { status: 200, differita: true };
      }
      const fd = new FormData();
      fd.append('dati', JSON.stringify({
        richiestaId: item.payload.richiestaId,
        committente: item.payload.committente,
        anagrafica: item.payload.anagrafica,
        risposte: item.payload.risposte,
        note: item.payload.note ?? null,
        parentVoceId: item.payload.parentVoceId ?? null,
      }));
      if (modo === 'con_foto') {
        for (const ref of item.payload.fotoBlobRefs) {
          const blob = await dbBlob.leggi(ref.blobId);
          if (blob) fd.append(`foto:${ref.chiave}`, blob, `${ref.chiave}.jpg`);
        }
      }
      const r = await fetch(`/api/r/${item.token}/intervento-manuale`, { method: 'POST', body: fd });
      let durabile = false;
      if (r.ok) {
        const j = (await r.json().catch(() => ({}))) as { durabile?: boolean };
        durabile = j.durabile === true;
      }
      const esito = esitoInvioManuale(modo, r.status, durabile, now);
      if (esito.tipo === 'rilascia') {
        for (const ref of item.payload.fotoBlobRefs) await dbBlob.rimuovi(ref.blobId);
        return { status: r.status }; // completato → item rimosso
      }
      if (esito.tipo === 'attesa_conferma') {
        await dbOutbox.put({ ...item, stato: 'in_attesa', caricato: true, confermaDopo: esito.confermaDopo });
        return { status: r.status, differita: true }; // tieni l'item: conferma differita più tardi
      }
      if (esito.tipo === 'ripara') {
        await dbOutbox.put({ ...item, stato: 'in_attesa', caricato: false, confermaDopo: undefined });
        return { status: r.status, differita: true };
      }
      if (esito.tipo === 'ritenta') return { status: r.status === 0 ? 0 : r.status, ritentabile: true };
      // bloccato
      return { status: r.status };
    }
    // invia
    const r = await fetch(`/api/r/${item.token}/invia`, { method: 'POST' });
    let corpo: unknown = null;
    if (r.status === 409) corpo = await r.json().catch(() => null);
    return { status: r.status, ritentabile: inviaRitentabile(r.status, corpo) };
  } catch {
    return { status: 0 }; // errore di rete
  }
}

/**
 * Sincronizza tutta la coda di un token. Ritorna true se la coda è vuota a fine giro.
 *
 * Nota resilienza: se la pagina si chiude DOPO che il server ha ricevuto una mutazione ma
 * PRIMA della rimozione locale dell'item, alla riapertura l'item viene re-inviato. È sicuro
 * perché gli endpoint sono idempotenti: voce (sovrascrive le risposte), agenda (imposta lo
 * stato), invia (imposta stato=inviato; un secondo invio ok/409), foto (clientKey) e
 * manuale (richiestaId) deduplicano lato server.
 */
export async function sincronizzaToken(token: string): Promise<boolean> {
  if (!indexedDbDisponibile() || inCorso) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  inCorso = true;
  try {
    const items = (await dbOutbox.perToken(token)).filter((i) => i.stato !== 'bloccato');
    const ordinati = ordineInvio(items);
    for (const item of ordinati) {
      await dbOutbox.put({ ...item, stato: 'in_invio' });
      const { status, ritentabile, differita } = await inviaElemento(item);
      if (differita) continue; // attesa/conferma differita: stato già persistito, prosegui con gli altri item
      const esito = ritentabile ? ({ esito: 'ritenta' } as const) : classificaEsito(status);
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
