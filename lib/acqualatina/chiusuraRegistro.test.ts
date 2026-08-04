import { describe, it, expect } from 'vitest';
import {
  esitoRiga, gruppiChiusura, NO_CHIUDE_DAL,
  STATO_APERTA_NON_ESEGUITA, STATO_CHIUSA_ESEGUITA, STATO_CHIUSA_NON_ESEGUITA,
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
    expect(g.esito).toBe('positivo');
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
    expect(g.esito).toBe('aperta_non_eseguita');
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
    expect(g.find((x) => x.esito === 'positivo' && x.patch.data_completamento === '2026-08-03')?.ids)
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
    expect(g.map((x) => [x.patch.stato_desc, x.esito])).toEqual([
      [STATO_APERTA_NON_ESEGUITA, 'aperta_non_eseguita'],
      [STATO_APERTA_NON_ESEGUITA, 'aperta_non_eseguita'],
      [STATO_CHIUSA_ESEGUITA, 'positivo'],
    ]);
  });
});

describe('i tre esiti del rapportino', () => {
  const base = { ordine_id: 'o1', data: '2026-08-10' };

  it('SI chiude la riga come eseguita', () => {
    expect(esitoRiga({ ...base, esito: 'eseguito_positivo', eseguito: 'SI' })).toBe('positivo');
  });

  it('NO chiude la riga, ma come NON eseguita', () => {
    // Su questa commessa il NO è definitivo: il contatore non c'è più, l'impianto è dismesso,
    // l'utente rifiuta. Tenerlo in coda sarebbe rumore su lavoro che nessuno farà.
    expect(esitoRiga({ ...base, esito: null, eseguito: 'NO' })).toBe('chiusa_non_eseguita');
  });

  it("NESSUN PASSAGGIO NON chiude: è un giro che non c'è stato", () => {
    // È il caso che la decisione del 03/08 proteggeva: il contatore è ancora lì da sostituire.
    expect(esitoRiga({ ...base, esito: null, eseguito: 'NESSUN PASSAGGIO' }))
      .toBe('aperta_non_eseguita');
  });

  it('nessuna risposta lascia la riga aperta', () => {
    expect(esitoRiga({ ...base, esito: null, eseguito: null })).toBe('aperta_non_eseguita');
    expect(esitoRiga({ ...base, esito: null, eseguito: '  ' })).toBe('aperta_non_eseguita');
  });

  it('il positivo vince sulla risposta scritta nella voce', () => {
    // Se l'intervento è chiuso positivo la riga è fatta: una voce che dice altro è un residuo.
    expect(esitoRiga({ ...base, esito: 'eseguito_positivo', eseguito: 'NO' })).toBe('positivo');
  });

  it('tollera spazi e minuscole nella risposta', () => {
    expect(esitoRiga({ ...base, esito: null, eseguito: ' no ' })).toBe('chiusa_non_eseguita');
    expect(esitoRiga({ ...base, esito: null, eseguito: 'nessun passaggio' }))
      .toBe('aperta_non_eseguita');
  });
});

describe('la data di taglio protegge le righe storiche', () => {
  it('un NO PRIMA del taglio non chiude', () => {
    // La riconciliazione rigira su TUTTI i completati a ogni apertura della tabella: senza
    // barriera chiuderebbe anche le 9 righe già esitate NO, che restano dove sono per decisione.
    expect(esitoRiga({ ordine_id: 'o1', data: '2026-07-29', esito: null, eseguito: 'NO' }))
      .toBe('aperta_non_eseguita');
  });

  it('un NO NEL giorno del taglio chiude', () => {
    expect(esitoRiga({ ordine_id: 'o1', data: NO_CHIUDE_DAL, esito: null, eseguito: 'NO' }))
      .toBe('chiusa_non_eseguita');
  });

  it('un NO senza data non chiude: senza giorno non si sa da che parte del taglio sta', () => {
    expect(esitoRiga({ ordine_id: 'o1', data: null, esito: null, eseguito: 'NO' }))
      .toBe('aperta_non_eseguita');
  });
});

describe('gruppiChiusura con i tre esiti', () => {
  it('raggruppa per giorno ed esito, e scrive lo stato che compete a ciascuno', () => {
    const gruppi = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: 'eseguito_positivo', eseguito: 'SI' },
      { ordine_id: 'b', data: '2026-08-10', esito: null, eseguito: 'NO' },
      { ordine_id: 'c', data: '2026-08-10', esito: null, eseguito: 'NESSUN PASSAGGIO' },
    ]);
    const perEsito = Object.fromEntries(gruppi.map((g) => [g.esito, g]));
    expect(perEsito.positivo.patch.aperto).toBe(false);
    expect(perEsito.chiusa_non_eseguita.patch.aperto).toBe(false);
    expect(perEsito.chiusa_non_eseguita.patch.stato_desc).toBe(STATO_CHIUSA_NON_ESEGUITA);
    expect(perEsito.chiusa_non_eseguita.patch.esito_positivo).toBe(false);
    expect(perEsito.aperta_non_eseguita.patch.aperto).toBe(true);
  });

  it("la riga chiusa NON eseguita porta la data dell'uscita", () => {
    // L'uscita c'è stata, ed è quella che ha chiuso la partita: la colonna «Chiusa il» ha un
    // giorno da mostrare. Sulla riga che resta APERTA no, perché non è chiusa.
    const [g] = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: null, eseguito: 'NO' },
    ]);
    expect(g.patch.data_completamento).toBe('2026-08-10');
    const [g2] = gruppiChiusura([
      { ordine_id: 'b', data: '2026-08-10', esito: null, eseguito: 'NESSUN PASSAGGIO' },
    ]);
    expect(g2.patch.data_completamento).toBeNull();
  });

  it('a parità di giorno il positivo si applica per ULTIMO', () => {
    const gruppi = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: 'eseguito_positivo', eseguito: 'SI' },
      { ordine_id: 'a', data: '2026-08-10', esito: null, eseguito: 'NO' },
    ]);
    expect(gruppi[gruppi.length - 1].esito).toBe('positivo');
  });
});
