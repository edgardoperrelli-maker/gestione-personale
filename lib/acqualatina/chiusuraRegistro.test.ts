import { describe, it, expect } from 'vitest';
import {
  agganciPerOdl, esitoRiga, gruppiChiusura, idsDaRiaprire, idsSenzaConcluso, NO_CHIUDE_DAL,
  patchAggancioAnagrafica,
  STATO_APERTA_NON_ESEGUITA, STATO_CHIUSA_ESEGUITA, STATO_CHIUSA_NON_ESEGUITA,
  type InterventoConcluso, type InterventoSciolto, type RigaPerAggancio,
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

describe('idsDaRiaprire — la seconda metà di «il positivo è definitivo»', () => {
  /*
    La guardia dei gruppi impedisce a un'uscita successiva di contraddire una chiusa positiva.
    Ma quando l'ufficio CORREGGE l'esito (il positivo era un errore di consuntivazione), il
    lavoro fatto non c'è mai stato: la riga chiusa non ha più niente dietro e deve riaprirsi
    da sola — senza questa lista la correzione andava rifatta a mano sul registro.
  */
  it('riapre la chiusa positiva il cui ordine non ha più nessun intervento positivo', () => {
    expect(idsDaRiaprire(['ord-1'], [negativo({ ordine_id: 'ord-1' })])).toEqual(['ord-1']);
  });

  it('anche senza più NESSUN intervento (annullato o cancellato): il lavoro dichiarato è sparito', () => {
    expect(idsDaRiaprire(['ord-1'], [])).toEqual(['ord-1']);
  });

  it('un positivo superstite tiene la riga chiusa: il ripasso riuscito non si riapre', () => {
    expect(idsDaRiaprire(['ord-1'], [
      negativo({ ordine_id: 'ord-1', data: '2026-08-01' }),
      concluso({ ordine_id: 'ord-1', data: '2026-08-02' }),
    ])).toEqual([]);
  });

  it('guarda solo l\'ordine della riga: i positivi degli altri ordini non la salvano', () => {
    expect(idsDaRiaprire(['ord-1', 'ord-2'], [concluso({ ordine_id: 'ord-2' })]))
      .toEqual(['ord-1']);
  });
});

describe('agganciPerOdl — il collegamento che si ripara da solo', () => {
  const riga = (id: string, odl: string, matricola_norm: string | null = null) =>
    ({ id, odl, matricola_norm });
  const sciolto = (id: string, odl: string | null, matricola: string | null = null) =>
    ({ id, odl, matricola_contatore: matricola, data: '2026-08-03', esito: 'eseguito_positivo' });

  it("l'ODL con una riga sola aggancia senza bisogno della matricola", () => {
    expect(agganciPerOdl([sciolto('i1', '100001')], [riga('o1', '100001')]))
      .toEqual([{ interventoId: 'i1', ordineId: 'o1' }]);
  });

  it('multi-contatore: aggancia solo se la matricola ne indica esattamente una', () => {
    const righe = [riga('o1', '100001', 'MTR001'), riga('o2', '100001', 'MTR002')];
    expect(agganciPerOdl([sciolto('i1', '100001', 'mtr-002')], righe))
      .toEqual([{ interventoId: 'i1', ordineId: 'o2' }]);
    // Senza matricola la scelta non è obbligata: meglio nessun aggancio di uno sbagliato.
    expect(agganciPerOdl([sciolto('i2', '100001')], righe)).toEqual([]);
  });

  it('ODL sconosciuto al registro o assente: resta sciolto', () => {
    expect(agganciPerOdl(
      [sciolto('i1', '999999'), sciolto('i2', null)],
      [riga('o1', '100001')],
    )).toEqual([]);
  });
});

describe('patchAggancioAnagrafica — il primo scatto per chi si aggancia senza averne mai avuto uno', () => {
  const ordine = (over: Partial<RigaPerAggancio> = {}): RigaPerAggancio => ({
    id: 'o1', odl: '100001', matricola_norm: 'MTR001',
    impianto: '12345', nominativo: 'ROSSI MARIO', recapito: '3331234567',
    via: 'VIA ROMA', civico: '10', comune: 'TERRACINA', cap: '04019', matricola: 'MTR001',
    ...over,
  });
  const intervento = (over: Partial<InterventoSciolto> = {}): InterventoSciolto => ({
    id: 'i1', odl: '100001', matricola_contatore: null, data: '2026-08-03',
    esito: 'eseguito_positivo', stato: 'completato',
    ...over,
  });

  it("riempie i campi vuoti dell'intervento con l'anagrafica del registro", () => {
    expect(patchAggancioAnagrafica(ordine(), intervento())).toEqual({
      pdr: '12345',
      nominativo: 'ROSSI MARIO',
      recapito: '3331234567',
      indirizzo: 'VIA ROMA 10',
      comune: 'TERRACINA',
      cap: '04019',
      matricola_contatore: 'MTR001',
    });
  });

  it('vale anche sul COMPLETATO: senza ordine_id non ha mai avuto una fotografia da rispettare', () => {
    const patch = patchAggancioAnagrafica(ordine(), intervento({ stato: 'completato' }));
    expect(patch.pdr).toBe('12345');
  });

  it('non sovrascrive un campo che l\'intervento ha già, da qualunque fonte sia arrivato', () => {
    const patch = patchAggancioAnagrafica(ordine({ impianto: '99999' }), intervento({ pdr: '12345' }));
    expect(patch.pdr).toBeUndefined();
  });

  it('un registro senza un dato non lo inventa: il campo resta fuori dal patch', () => {
    const patch = patchAggancioAnagrafica(ordine({ impianto: null, recapito: '' }), intervento());
    expect(patch.pdr).toBeUndefined();
    expect(patch.recapito).toBeUndefined();
  });

  it('via senza civico (o viceversa) basta a comporre un indirizzo', () => {
    expect(patchAggancioAnagrafica(ordine({ via: 'VIA ROMA', civico: null }), intervento()).indirizzo)
      .toBe('VIA ROMA');
    expect(patchAggancioAnagrafica(ordine({ via: null, civico: '10' }), intervento()).indirizzo)
      .toBe('10');
  });

  it('nessun campo da riempire produce un patch vuoto', () => {
    const pieno = intervento({
      pdr: '1', nominativo: 'X', recapito: '1', indirizzo: 'X', comune: 'X', cap: '1',
      matricola_contatore: '1',
    });
    expect(patchAggancioAnagrafica(ordine(), pieno)).toEqual({});
  });
});

describe('idsSenzaConcluso — la «non eseguita» senza più niente dietro torna «Aperta»', () => {
  it("ripulisce la riga il cui unico negativo è stato azzerato o cancellato", () => {
    expect(idsSenzaConcluso(['ord-1'], [])).toEqual(['ord-1']);
  });
  it('un concluso QUALSIASI (anche negativo) tiene il marchio: l\'uscita a vuoto è vera', () => {
    expect(idsSenzaConcluso(['ord-1'], [negativo({ ordine_id: 'ord-1' })])).toEqual([]);
    expect(idsSenzaConcluso(['ord-1'], [concluso({ ordine_id: 'ord-1' })])).toEqual([]);
  });
  it('guarda solo il proprio ordine', () => {
    expect(idsSenzaConcluso(['ord-1', 'ord-2'], [negativo({ ordine_id: 'ord-2' })]))
      .toEqual(['ord-1']);
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
