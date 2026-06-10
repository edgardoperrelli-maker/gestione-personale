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
