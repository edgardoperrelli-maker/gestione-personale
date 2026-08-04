import { describe, expect, it } from 'vitest';
import { STATI_MISURATORE } from '@/types/misuratori';
import { statoDopoCesta } from './cestaStato';

describe('statoDopoCesta', () => {
  it('la cesta scritta su una riga da consegnare REGISTRA lo scarico', () => {
    // L'operatore ha scaricato senza dichiararlo e l'ha detto all'ufficio: la cesta sta in
    // magazzino, quindi il contatore è in deposito.
    expect(statoDopoCesta('da_consegnare_deposito', '3')).toBe('scaricato_deposito');
  });

  it('la cesta svuotata su una riga scaricata la rimanda fra quelle da scaricare', () => {
    // Il gesto «pardon, è ancora in furgone». Senza il ritorno, la riga resterebbe
    // «scaricata» senza cesta: fuori dal bacino della modale PER SEMPRE.
    expect(statoDopoCesta('scaricato_deposito', null)).toBe('da_consegnare_deposito');
  });

  it('correggere la cifra su una riga già scaricata non tocca lo stato', () => {
    // È il caso più frequente in assoluto, e deve restare a costo zero.
    expect(statoDopoCesta('scaricato_deposito', '7')).toBeNull();
  });

  it('svuotare la cesta di una riga già da consegnare non ha niente da fare', () => {
    expect(statoDopoCesta('da_consegnare_deposito', null)).toBeNull();
  });

  it('oltre lo scarico la logistica è andata avanti: nessuna scrittura la riporta indietro', () => {
    const oltre = ['verificato_deposito', 'in_consegna_committente', 'consegnato_committente'] as const;
    for (const stato of oltre) {
      expect(statoDopoCesta(stato, '4'), `${stato} + cesta`).toBeNull();
      expect(statoDopoCesta(stato, null), `${stato} senza cesta`).toBeNull();
    }
  });

  it('solo i due gradini adiacenti si muovono: il resto della lista sta fermo', () => {
    // Se domani nasce un sesto stato, il conteggio lo fa notare QUI invece che in magazzino.
    const conCesta = STATI_MISURATORE.filter((s) => statoDopoCesta(s, '1') !== null);
    const senzaCesta = STATI_MISURATORE.filter((s) => statoDopoCesta(s, null) !== null);
    expect(conCesta).toEqual(['da_consegnare_deposito']);
    expect(senzaCesta).toEqual(['scaricato_deposito']);
  });
});
