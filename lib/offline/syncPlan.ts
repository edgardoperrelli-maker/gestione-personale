import type { OutboxItem } from './types';

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
  if (status === 409) return { esito: 'bloccato', motivo: 'Link scaduto o non più modificabile' };
  if (status === 403) return { esito: 'bloccato', motivo: 'Giornata già chiusa' };
  if (status === 422) return { esito: 'bloccato', motivo: 'Dati non validi' };
  return { esito: 'ritenta' };
}
