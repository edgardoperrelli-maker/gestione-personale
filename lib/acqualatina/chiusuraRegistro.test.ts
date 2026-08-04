import { describe, it, expect } from 'vitest';
import {
  agganciPerOdl, gruppiChiusura, idsDaRiaprire, STATO_APERTA_NON_ESEGUITA,
  STATO_CHIUSA_ESEGUITA, type InterventoConcluso,
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
