// Mappa il filtro-stato della UI del Live ('tutti'|'ok'|'ko'|'attesa') a un
// predicato sull'intervento, riusando la stessa logica cromatica della board.
import { coloreStato } from './torreView';

export type FiltroStatoLive = 'tutti' | 'ok' | 'ko' | 'attesa';

export function interventoMatchStato(
  it: { stato: string; esito: string | null },
  filtro: FiltroStatoLive,
): boolean {
  if (filtro === 'tutti') return true;
  return coloreStato(it.stato, it.esito) === filtro;
}
