import type { OutboxItem } from './types';

export function chiaveCoalescing(item: OutboxItem): string {
  if (item.type === 'voce') return `voce:${item.token}:${item.payload.voceId}`;
  if (item.type === 'agenda') return `agenda:${item.token}:${item.payload.interventoId}`;
  return `${item.type}:${item.id}`;
}

export function applicaUpsert(esistenti: OutboxItem[], nuovo: OutboxItem): OutboxItem[] {
  const chiave = chiaveCoalescing(nuovo);
  const idx = esistenti.findIndex((e) => chiaveCoalescing(e) === chiave);
  if (idx === -1) return [...esistenti, nuovo];
  const precedente = esistenti[idx];
  const fuso = { ...nuovo, id: precedente.id, createdAt: precedente.createdAt, tentativi: 0, stato: 'in_attesa', ultimoErrore: undefined } as OutboxItem;
  const out = esistenti.slice();
  out[idx] = fuso;
  return out;
}

export function marcaErrore(item: OutboxItem, errore: string): OutboxItem {
  return { ...item, tentativi: item.tentativi + 1, stato: 'errore', ultimoErrore: errore };
}

export function prossimoTentativoMs(tentativi: number): number {
  return Math.min(1000 * 2 ** (tentativi - 1), 60000);
}

/**
 * Tetto ai tentativi di re-invio per gli errori transitori (rete/5xx/429). Oltre questa
 * soglia un item che continua a non passare smette di essere ritentato all'infinito: è la
 * rete di sicurezza contro l'elemento "avvelenato" (es. body multipart che arriva sempre
 * troncato → il server risponde 500 → verrebbe ritentato per sempre).
 */
export const MAX_TENTATIVI_RETE = 12;

/**
 * Stato successivo di un item dopo un errore transitorio. Sotto il tetto resta in 'errore'
 * (verrà ritentato al trigger successivo); raggiunto il tetto diventa 'bloccato'
 * ("da risolvere"), così un singolo elemento non-inviabile non blocca più tutta la coda
 * né martella il server, e l'operatore vede un esito azionabile invece dello spinner infinito.
 */
export function esitoErroreRete(item: OutboxItem, max: number = MAX_TENTATIVI_RETE): OutboxItem {
  const marcato = marcaErrore(item, 'rete');
  if (marcato.tentativi >= max) {
    return { ...marcato, stato: 'bloccato', ultimoErrore: 'Invio non riuscito più volte — controlla la connessione o contatta l’ufficio' };
  }
  return marcato;
}
