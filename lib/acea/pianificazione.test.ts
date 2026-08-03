import { describe, it, expect } from 'vitest';
import {
  pianoPianificazione, etichettaMotivo,
  type InterventoEsistente, type OrdineDaPianificare,
} from './pianificazione';

const ordine = (over: Partial<OrdineDaPianificare> = {}): OrdineDaPianificare => ({
  odl: '912215286', numero_operazione: '0010', ordine_id: 'ord-1', aperto: true,
  attivita: 'Limitazione Massiva su Impianto', comune: 'ZAGAROLO',
  via: 'VIA ALFA', civico: '108', cap: '00139', matricola: '201215053510',
  ...over,
});

const intervento = (over: Partial<InterventoEsistente> = {}): InterventoEsistente => ({
  id: 'int-1', odl: '912215286', data: '2026-07-20', staff_id: 's1', stato: 'assegnato',
  esito: null,
  ...over,
});

/** Uscita chiusa col lavoro FATTO: l'unica che chiude l'unità per sempre. */
const positivo = (over: Partial<InterventoEsistente> = {}): InterventoEsistente =>
  intervento({ stato: 'completato', esito: 'eseguito_positivo', ...over });

/** Uscita chiusa A VUOTO (utente assente, contatore inaccessibile): il caso normale del dunning. */
const uscitaAVuoto = (over: Partial<InterventoEsistente> = {}): InterventoEsistente =>
  intervento({ stato: 'completato', esito: null, ...over });

const ARG = { data: '2026-07-27', staffId: 's2' };

describe('pianoPianificazione — creazione', () => {
  it('un ordine aperto senza interventi si crea', () => {
    const p = pianoPianificazione({ ordini: [ordine()], esistenti: [], ...ARG });
    expect(p.creati).toBe(1);
    expect(p.azioni[0]).toMatchObject({ tipo: 'crea' });
  });

  it('due operazioni dello stesso ordine sono UN passaggio sul posto: un intervento solo', () => {
    // Due `crea` sulla stessa unità violerebbero l'unique (committente, odl, data) a metà
    // scrittura: la prima riga decide, la seconda viaggia con lei.
    const p = pianoPianificazione({
      ordini: [ordine({ numero_operazione: '0040' }), ordine({ numero_operazione: '0050' })],
      esistenti: [], ...ARG,
    });
    expect(p.creati).toBe(1);
    expect(p.saltati).toBe(0);
  });

  it('e vale anche quando l\'unità riparte dopo un\'uscita a vuoto', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ numero_operazione: '0040' }), ordine({ numero_operazione: '0050' })],
      esistenti: [intervento({ stato: 'completato', esito: null, data: '2026-07-06' })],
      ...ARG,
    });
    expect(p.creati).toBe(1);
    expect(p.saltati).toBe(0);
  });

  it('ODL diversi restano righe indipendenti', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ odl: 'A' }), ordine({ odl: 'B' })],
      esistenti: [], ...ARG,
    });
    expect(p.creati).toBe(2);
  });
});

describe('pianoPianificazione — spostamento', () => {
  it('un intervento aperto viene SPOSTATO, non duplicato', () => {
    // Due interventi sullo stesso ODL violerebbero l'unique (committente, odl, data) e — peggio —
    // manderebbero due squadre allo stesso indirizzo.
    const p = pianoPianificazione({ ordini: [ordine()], esistenti: [intervento()], ...ARG });
    expect(p.creati).toBe(0);
    expect(p.aggiornati).toBe(1);
    expect(p.azioni[0]).toMatchObject({
      tipo: 'aggiorna',
      interventoId: 'int-1',
      prima: { data: '2026-07-20', staff_id: 's1' },
    });
  });

  it('registra lo stato precedente per l\'annullamento', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ data: '2026-07-01', staff_id: 'sX' })],
      ...ARG,
    });
    const a = p.azioni[0];
    expect(a.tipo).toBe('aggiorna');
    if (a.tipo === 'aggiorna') expect(a.prima).toEqual({ data: '2026-07-01', staff_id: 'sX' });
  });

  it('fra più interventi aperti sposta il più recente', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [
        intervento({ id: 'vecchio', data: '2026-06-01' }),
        intervento({ id: 'recente', data: '2026-07-10' }),
      ],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'aggiorna', interventoId: 'recente' });
  });

  it('già su questo giorno e questo operatore: nessuna azione', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ data: '2026-07-27', staff_id: 's2' })],
      ...ARG,
    });
    expect(p.azioni).toHaveLength(0);
  });

  it('stesso giorno ma operatore diverso: si aggiorna', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ data: '2026-07-27', staff_id: 'altro' })],
      ...ARG,
    });
    expect(p.aggiornati).toBe(1);
  });

  it('un intervento annullato non blocca la creazione', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ stato: 'annullato' })],
      ...ARG,
    });
    expect(p.creati).toBe(1);
  });
});

describe('pianoPianificazione — salti', () => {
  it('un ordine chiuso su ACEA non si pianifica', () => {
    const p = pianoPianificazione({ ordini: [ordine({ aperto: false })], esistenti: [], ...ARG });
    expect(p.saltati).toBe(1);
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'ordine_chiuso' });
  });

  it('un ODL con esito POSITIVO non si ripianifica', () => {
    // «ODL positivo = definitivamente chiuso»: la stessa invariante dell'indice unique e dello
    // sweep. Il lavoro è fatto, anche se il registro ACEA non l'ha ancora recepito.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [positivo()],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'gia_completato' });
  });

  it('il positivo vince anche se c\'è pure un intervento aperto', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ id: 'a', stato: 'assegnato' }), positivo({ id: 'b' })],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'gia_completato' });
  });
});

/*
  Il caso normale del dunning: la squadra esce, non riesce (utente assente, contatore
  inaccessibile), l'uscita si chiude a vuoto — e l'ordine su ACEA RESTA APERTO. Sullo stesso ODL
  si torna anche sei volte. Un'uscita a vuoto non può bloccare la successiva: era il difetto per
  cui la griglia rispondeva «intervento già completato» a un ordine ancora da lavorare.
*/
describe('pianoPianificazione — uscite a vuoto', () => {
  it('un\'uscita a vuoto non blocca: nasce un\'uscita NUOVA', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [uscitaAVuoto()],
      ...ARG,
    });
    expect(p.saltati).toBe(0);
    expect(p.azioni[0]).toMatchObject({ tipo: 'crea' });
  });

  it('l\'uscita a vuoto non è MAI candidata allo spostamento: si sposta l\'aperto', () => {
    // Il lavoro registrato non si tocca (stessa regola di `spostamento_completato`): la
    // ripianificazione muove l'intervento APERTO, anche se l'uscita a vuoto è più recente.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [
        intervento({ id: 'aperto', data: '2026-06-23' }),
        uscitaAVuoto({ id: 'vuoto', data: '2026-07-06' }),
      ],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({
      tipo: 'aggiorna',
      interventoId: 'aperto',
      prima: { data: '2026-06-23', staff_id: 's1' },
    });
  });

  it('sei uscite a vuoto e un aperto: si sposta sempre e solo l\'aperto', () => {
    const vuote = ['2026-06-24', '2026-06-25', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-06']
      .map((data, i) => uscitaAVuoto({ id: `v${i}`, data }));
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [...vuote, intervento({ id: 'aperto', data: '2026-06-23' })],
      ...ARG,
    });
    expect(p.aggiornati).toBe(1);
    expect(p.azioni[0]).toMatchObject({ tipo: 'aggiorna', interventoId: 'aperto' });
  });

  it('sul giorno di un\'uscita già registrata non si crea: giorno occupato', () => {
    // L'unique `(committente, odl, data)` esploderebbe in un 500: meglio un rifiuto che si legge.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [uscitaAVuoto({ data: ARG.data })],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'giorno_occupato' });
  });

  it('nemmeno l\'aperto si può SPOSTARE su un giorno con un\'uscita registrata', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [
        intervento({ id: 'aperto', data: '2026-06-23' }),
        uscitaAVuoto({ id: 'vuoto', data: ARG.data }),
      ],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'giorno_occupato' });
  });

  it('un annullato sul giorno scelto occupa comunque la riga in tabella', () => {
    // Per la pianificazione l'annullato non esiste, ma l'indice unique la sua riga la vede.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ stato: 'annullato', data: ARG.data })],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'giorno_occupato' });
  });

  it('a data INVARIATA il giorno «occupato» non blocca il cambio di esecutore', () => {
    // L'aperto sta già sul giorno scelto e cambia solo la mano: l'UPDATE non tocca la tupla
    // dell'unique. La riga che «occupa» — qui un'uscita di un altro committente, che l'indice
    // per-committente ammette — non ha autorità su chi ci va.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [
        intervento({ id: 'aperto', data: ARG.data, staff_id: 's1' }),
        uscitaAVuoto({ id: 'altra-commessa', data: ARG.data }),
      ],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'aggiorna', interventoId: 'aperto' });
  });
});

describe('pianoPianificazione — riepilogo misto', () => {
  it('conta correttamente creati, aggiornati e saltati', () => {
    const p = pianoPianificazione({
      ordini: [
        ordine({ odl: 'A' }),
        ordine({ odl: 'B' }),
        ordine({ odl: 'C', aperto: false }),
        ordine({ odl: 'D' }),
      ],
      esistenti: [
        intervento({ id: 'i-b', odl: 'B', stato: 'assegnato' }),
        positivo({ id: 'i-d', odl: 'D' }),
      ],
      ...ARG,
    });
    expect(p).toMatchObject({ creati: 1, aggiornati: 1, saltati: 2 });
  });
});

// Venerdì e sabato le riaperture hanno un giorno di cardine contrattuale: nel DUNNING ci vanno
// solo quelle, il resto aspetta il lunedì. Le limitazioni MASSIVE sono esenti (dec. 38): campagne
// per paese, si pianificano anche in quei giorni.
describe('pianoPianificazione — giorni di sole attivazioni', () => {
  const ARG_VEN = { data: '2026-07-31', staffId: 's2', soloAttivazioni: true };

  it('un’attivazione passa', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: true })], esistenti: [], ...ARG_VEN,
    });
    expect(p.creati).toBe(1);
  });

  it('una limitazione viene saltata, col suo motivo', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: false })], esistenti: [], ...ARG_VEN,
    });
    expect(p.saltati).toBe(1);
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'solo_attivazioni' });
  });

  it('un ordine senza `riapertura` dichiarata NON passa: si sbaglia per difetto, non per eccesso', () => {
    const p = pianoPianificazione({ ordini: [ordine()], esistenti: [], ...ARG_VEN });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'solo_attivazioni' });
  });

  it('una limitazione MASSIVE passa: la regola è del dunning, non del giorno', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: false, famiglia: 'massive' })], esistenti: [], ...ARG_VEN,
    });
    expect(p.creati).toBe(1);
    expect(p.saltati).toBe(0);
  });

  it('e una massive si può anche SPOSTARE su venerdì o sabato', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: false, famiglia: 'massive' })],
      esistenti: [intervento()],
      ...ARG_VEN,
    });
    expect(p.aggiornati).toBe(1);
  });

  it('la famiglia ASSENTE resta sotto la regola piena: si sbaglia per difetto', () => {
    // Una riga di cui non si sa la famiglia non guadagna l'esenzione: come per `riapertura`.
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: false, famiglia: 'dunning' }), ordine({ odl: 'X', riapertura: false })],
      esistenti: [],
      ...ARG_VEN,
    });
    expect(p.saltati).toBe(2);
  });

  it('nemmeno per SPOSTARCI un intervento che esiste già', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ riapertura: false })], esistenti: [intervento()], ...ARG_VEN,
    });
    expect(p.aggiornati).toBe(0);
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'solo_attivazioni' });
  });

  it('un ordine già chiuso resta «chiuso», non diventa «solo attivazioni»', () => {
    // L'ordine dei controlli conta: il motivo che si legge deve essere quello che si risolve.
    const p = pianoPianificazione({
      ordini: [ordine({ aperto: false, riapertura: false })], esistenti: [], ...ARG_VEN,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'ordine_chiuso' });
  });

  it('negli altri giorni la limitazione passa come sempre', () => {
    const p = pianoPianificazione({ ordini: [ordine({ riapertura: false })], esistenti: [], ...ARG });
    expect(p.creati).toBe(1);
  });
});

describe('pianoPianificazione — unità ODL+matricola (AcquaLatina)', () => {
  // Nel master di Terracina un ODL copre fino a cinque contatori: ogni matricola è un lavoro suo.
  const A = ordine({ famiglia: 'acqualatina', numero_operazione: '1', matricola: 'MTR-A' });
  const B = ordine({ famiglia: 'acqualatina', numero_operazione: '2', matricola: 'MTR-B' });

  it('pianificare il secondo contatore NON sposta l\'intervento del primo', () => {
    const p = pianoPianificazione({
      ordini: [B],
      esistenti: [intervento({ matricola: 'MTR-A' })],
      ...ARG,
      unita: 'odl_matricola',
    });
    // Con l'unità sul solo ODL sarebbe un «aggiorna» dell'intervento di MTR-A: due squadre in
    // meno e un contatore mai pianificato. Qui invece nasce un intervento NUOVO.
    expect(p.aggiornati).toBe(0);
    expect(p.creati).toBe(1);
  });

  it('il positivo di un contatore non blocca il fratello', () => {
    const p = pianoPianificazione({
      ordini: [B],
      esistenti: [positivo({ matricola: 'MTR-A' })],
      ...ARG,
      unita: 'odl_matricola',
    });
    expect(p.creati).toBe(1);
    expect(p.saltati).toBe(0);
  });

  it('sulla STESSA matricola le invarianti restano quelle di sempre', () => {
    const sposta = pianoPianificazione({
      ordini: [A], esistenti: [intervento({ matricola: 'mtr-a' })], ...ARG, unita: 'odl_matricola',
    });
    // Il confronto è sul normalizzato: maiuscole o trattini diversi non duplicano.
    expect(sposta.aggiornati).toBe(1);
    const fermo = pianoPianificazione({
      ordini: [A],
      esistenti: [positivo({ matricola: 'MTR-A' })],
      ...ARG,
      unita: 'odl_matricola',
    });
    expect(fermo.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'gia_completato' });
  });

  it('acqualatina è esente dal venerdì/sabato come le massive', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ famiglia: 'acqualatina', riapertura: false })],
      esistenti: [],
      data: '2026-07-31', // venerdì
      staffId: 's2',
      soloAttivazioni: true,
      unita: 'odl_matricola',
    });
    expect(p.creati).toBe(1);
  });
});

describe('etichettaMotivo', () => {
  it('spiega il motivo in italiano', () => {
    expect(etichettaMotivo('ordine_chiuso')).toMatch(/chiuso/i);
    expect(etichettaMotivo('gia_completato')).toMatch(/positivo/i);
    expect(etichettaMotivo('solo_attivazioni')).toMatch(/attivazion/i);
    expect(etichettaMotivo('giorno_occupato')).toMatch(/giorno/i);
  });

  /*
    «ordine già chiuso su ACEA» su una riga AcquaLatina nomina un committente che con quella
    commessa non c'entra, e manda a cercare la causa dove non c'è: è il messaggio che il 03/08 ha
    fatto sembrare un problema di import quello che era una chiusura sbagliata a monte.
  */
  it('non nomina ACEA su una riga AcquaLatina', () => {
    expect(etichettaMotivo('ordine_chiuso', 'acqualatina')).not.toMatch(/acea/i);
    expect(etichettaMotivo('ordine_chiuso', 'massive')).toMatch(/acea/i);
  });
});
