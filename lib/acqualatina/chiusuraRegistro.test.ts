import { describe, it, expect } from 'vitest';
import {
  gruppiChiusura, STATO_APERTA_NON_ESEGUITA, STATO_CHIUSA_ESEGUITA,
  type InterventoConcluso,
} from './chiusuraRegistro';

const concluso = (over: Partial<InterventoConcluso> = {}): InterventoConcluso => ({
  ordine_id: 'ord-1', data: '2026-08-03', esito: 'eseguito_positivo', ...over,
});

/** Uscita chiusa A VUOTO: utente assente, contatore inaccessibile. Il contatore è ancora lì. */
const negativo = (over: Partial<InterventoConcluso> = {}): InterventoConcluso =>
  concluso({ esito: 'accesso_a_vuoto', ...over });

describe('gruppiChiusura — il positivo chiude', () => {
  it('un esito positivo chiude la riga e le scrive il giorno', () => {
    const [g] = gruppiChiusura([concluso()]);
    expect(g.positivo).toBe(true);
    expect(g.patch).toEqual({
      aperto: false,
      stato: 'CHIUSO',
      stato_desc: STATO_CHIUSA_ESEGUITA,
      esito_positivo: true,
      data_completamento: '2026-08-03',
    });
  });
});

/*
  Il cuore della correzione del 03/08. Dodici righe di via Tuccia esitate negative erano finite in
  «Chiusi» con `aperto = false`, e riassegnarle rispondeva «ordine già chiuso»: lavoro vero, ancora
  da fare, che il registro dichiarava concluso.
*/
describe('gruppiChiusura — il negativo NON chiude', () => {
  it('un esito negativo lascia la riga aperta e dice com’è andata', () => {
    const [g] = gruppiChiusura([negativo()]);
    expect(g.positivo).toBe(false);
    expect(g.patch.aperto).toBe(true);
    expect(g.patch.stato_desc).toBe(STATO_APERTA_NON_ESEGUITA);
    expect(g.patch.esito_positivo).toBe(false);
  });

  it('e non scrive la data di chiusura: la riga non è chiusa', () => {
    const [g] = gruppiChiusura([negativo()]);
    expect(g.patch.data_completamento).toBeNull();
  });

  it('vale per QUALUNQUE causale, non per un elenco di quelle previste', () => {
    for (const esito of ['accesso_negato', 'contatore_non_trovato', 'rinviato', null]) {
      const [g] = gruppiChiusura([concluso({ esito })]);
      expect(g.patch.aperto).toBe(true);
    }
  });
});

describe('gruppiChiusura — raggruppamento', () => {
  it('un aggiornamento per (giorno, esito), non uno per riga', () => {
    const g = gruppiChiusura([
      concluso({ ordine_id: 'a' }), concluso({ ordine_id: 'b' }),
      negativo({ ordine_id: 'c' }),
      concluso({ ordine_id: 'd', data: '2026-08-04' }),
    ]);
    expect(g).toHaveLength(3);
    expect(g.find((x) => x.positivo && x.patch.data_completamento === '2026-08-03')?.ids)
      .toEqual(['a', 'b']);
  });

  it('salta gli interventi senza riga di registro agganciata', () => {
    expect(gruppiChiusura([concluso({ ordine_id: null })])).toEqual([]);
  });

  /*
    L'ordine non può dipendere da come una `Map` capita di essere percorsa: su un'unità ripassata
    più volte l'ultima parola deve restare all'uscita più recente. Il positivo va per ultimo a
    parità di giorno — è l'esito definitivo, e nessuna scrittura successiva deve poterlo smentire.
  */
  it('applica i gruppi in ordine di giorno, e il positivo per ultimo a parità di giorno', () => {
    const g = gruppiChiusura([
      concluso({ ordine_id: 'a', data: '2026-08-05' }),
      negativo({ ordine_id: 'a', data: '2026-08-05' }),
      negativo({ ordine_id: 'a', data: '2026-08-03' }),
    ]);
    expect(g.map((x) => [x.patch.stato_desc, x.positivo])).toEqual([
      [STATO_APERTA_NON_ESEGUITA, false],
      [STATO_APERTA_NON_ESEGUITA, false],
      [STATO_CHIUSA_ESEGUITA, true],
    ]);
  });
});
