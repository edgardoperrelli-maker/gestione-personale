import type { OutboxItem } from './types';
import { messaggioErroreManuale } from '@/lib/interventi/manuali/messaggioErroreManuale';

function priorita(type: OutboxItem['type']): number {
  switch (type) {
    case 'foto': return 0;
    case 'manuale': return 1;
    case 'voce': return 2;
    case 'agenda': return 2;
    case 'invia': return 9;
  }
}

export function ordineInvio(items: OutboxItem[]): OutboxItem[] {
  const nonInvia = items.filter((i) => i.type !== 'invia');
  const invia = items.filter((i) => i.type === 'invia');
  const ordinati = nonInvia
    .slice()
    .sort((a, b) => priorita(a.type) - priorita(b.type) || a.createdAt - b.createdAt);

  // Se non ci sono item non-invia, restituiamo solo il primo invia (se esiste)
  if (nonInvia.length === 0) {
    if (invia.length === 0) return [];
    return [invia.sort((a, b) => a.createdAt - b.createdAt)[0]];
  }

  // Escludiamo invia se esiste almeno un item non-invia bloccato
  const haBloccati = nonInvia.some((i) => i.stato === 'bloccato');
  if (haBloccati) return ordinati;

  // Altrimenti appende invia (ordinato per createdAt) in coda
  const inviaOrdinati = invia.slice().sort((a, b) => a.createdAt - b.createdAt);
  return [...ordinati, ...inviaOrdinati];
}

export type EsitoSync =
  | { esito: 'completato' }
  | { esito: 'ritenta' }
  | { esito: 'bloccato'; motivo: string };

export function classificaEsito(status: number): EsitoSync {
  if (status >= 200 && status < 300) return { esito: 'completato' };
  // Transitori → ritenta: errore di rete (0), troppe richieste (429), errori server (5xx).
  if (status === 0 || status === 429 || status >= 500) return { esito: 'ritenta' };
  // Errori client permanenti (4xx): ritentare non aiuta → bloccato (motivo per i casi noti).
  if (status === 403) return { esito: 'bloccato', motivo: 'Giornata già chiusa' };
  if (status === 409) return { esito: 'bloccato', motivo: 'Link scaduto o non più modificabile' };
  if (status === 422) return { esito: 'bloccato', motivo: 'Dati non validi' };
  // 400: la voce/intervento non è più presente lato server (tipicamente il rapportino è stato
  // rigenerato dall'ufficio → l'id è cambiato). Col fallback per task_id su /voce questo scatta
  // ormai solo quando il task è stato davvero rimosso dal piano: messaggio azionabile.
  if (status === 400) return { esito: 'bloccato', motivo: 'Intervento non più disponibile — riapri il link' };
  return { esito: 'bloccato', motivo: 'Richiesta non valida' };
}

/** Rilascia i blob solo se il server conferma la DURABILITÀ (non la semplice presenza immediata). */
export function deveRilasciareFoto(status: number, durabile: boolean): boolean {
  return status >= 200 && status < 300 && durabile === true;
}

/**
 * Motivo amichevole per il 400 del percorso manuale quando il body porta uno dei codici
 * attività (spec §7: obbligo descrizione a lista chiusa). Per gli altri 400 ritorna null
 * → resta il motivo storico di classificaEsito ("riapri il link"), che lì è corretto.
 */
export function motivoManuale400(body: { error?: string; messaggio?: string } | null): string | null {
  if (!body) return null;
  if (body.error !== 'attivita_obbligatoria' && body.error !== 'attivita_sconosciuta') return null;
  return messaggioErroreManuale(body, 400);
}

/** Finestra minima prima di tentare la conferma differita: supera la finestra di sparizione osservata. */
export const GRACE_CONFERMA_MS = 90_000;

export type ModoInvioManuale = 'con_foto' | 'senza_foto' | 'attendi';

/** Decide come ri-presentare una richiesta manuale: primo invio/riparazione (con foto),
 *  conferma a banda minima (senza foto), oppure attendi la fine della grace. */
export function modoInvioManuale(item: { caricato?: boolean; confermaDopo?: number }, now: number): ModoInvioManuale {
  if (!item.caricato) return 'con_foto';
  if (item.confermaDopo != null && now < item.confermaDopo) return 'attendi';
  return 'senza_foto';
}

export type EsitoManuale =
  | { tipo: 'rilascia' }
  | { tipo: 'attesa_conferma'; confermaDopo: number }
  | { tipo: 'ripara' }
  | { tipo: 'ritenta' }
  | { tipo: 'bloccato'; motivo: string };

/** Transizione post-risposta per l'item manuale. */
export function esitoInvioManuale(modo: ModoInvioManuale, status: number, durabile: boolean, now: number): EsitoManuale {
  if (status < 200 || status >= 300) {
    const base = classificaEsito(status);
    return base.esito === 'ritenta' ? { tipo: 'ritenta' } : { tipo: 'bloccato', motivo: base.esito === 'bloccato' ? base.motivo : 'Richiesta non valida' };
  }
  if (durabile) return { tipo: 'rilascia' };
  if (modo === 'con_foto') return { tipo: 'attesa_conferma', confermaDopo: now + GRACE_CONFERMA_MS };
  return { tipo: 'ripara' };
}
