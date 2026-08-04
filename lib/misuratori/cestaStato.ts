import type { StatoMisuratore } from '@/types/misuratori';

/*
  L'invariante del registro AcquaLatina: `cesta` valorizzata ⟺ lo stato è almeno
  «scaricato deposito».

  Un numero di cesta è la PROVA che quel contatore è in deposito — la cesta sta in magazzino.
  Se il numero c'è, lo stato non può dire «da consegnare»; se lo stato dice «da consegnare», il
  numero non può esserci. Il flusso dell'operatore lo rispettava già (`registraScarico` scrive i
  due campi in una UPDATE sola); questa funzione è come lo rispetta l'ufficio, che invece scrive
  un campo per volta. Spec: docs/superpowers/specs/2026-08-04-acqualatina-cesta-stato-coerenza-design.md
*/

/**
 * Lo stato che la scrittura della cesta si porta dietro. `null` = non toccare lo stato.
 *
 * Si muove SOLO fra i due gradini adiacenti. Oltre `scaricato_deposito` la logistica è andata
 * avanti: correggere una cifra non deve tirare indietro una riga già verificata, e togliere un
 * numero non deve far tornare di tre gradini un misuratore già consegnato al committente.
 *
 * `cestaNuova` arriva già normalizzata — stringa piena oppure `null`, mai `''`.
 */
export function statoDopoCesta(
  statoCorrente: StatoMisuratore,
  cestaNuova: string | null,
): StatoMisuratore | null {
  if (cestaNuova !== null) {
    return statoCorrente === 'da_consegnare_deposito' ? 'scaricato_deposito' : null;
  }
  return statoCorrente === 'scaricato_deposito' ? 'da_consegnare_deposito' : null;
}
