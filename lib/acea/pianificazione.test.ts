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
  ...over,
});

const ARG = { data: '2026-07-27', staffId: 's2' };

describe('pianoPianificazione — creazione', () => {
  it('un ordine aperto senza interventi si crea', () => {
    const p = pianoPianificazione({ ordini: [ordine()], esistenti: [], ...ARG });
    expect(p.creati).toBe(1);
    expect(p.azioni[0]).toMatchObject({ tipo: 'crea' });
  });

  it('due operazioni dello stesso ordine sono due righe da pianificare', () => {
    const p = pianoPianificazione({
      ordini: [ordine({ numero_operazione: '0040' }), ordine({ numero_operazione: '0050' })],
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

  it('un ODL con intervento già completato non si sposta', () => {
    // Stessa invariante di `spostamento_completato` nel motore rapportini: il lavoro registrato
    // non si tocca.
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ stato: 'completato' })],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'gia_completato' });
  });

  it('il completato vince anche se c\'è pure un intervento aperto', () => {
    const p = pianoPianificazione({
      ordini: [ordine()],
      esistenti: [intervento({ id: 'a', stato: 'assegnato' }), intervento({ id: 'b', stato: 'completato' })],
      ...ARG,
    });
    expect(p.azioni[0]).toMatchObject({ tipo: 'salta', motivo: 'gia_completato' });
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
        intervento({ id: 'i-d', odl: 'D', stato: 'completato' }),
      ],
      ...ARG,
    });
    expect(p).toMatchObject({ creati: 1, aggiornati: 1, saltati: 2 });
  });
});

describe('etichettaMotivo', () => {
  it('spiega il motivo in italiano', () => {
    expect(etichettaMotivo('ordine_chiuso')).toMatch(/chiuso/i);
    expect(etichettaMotivo('gia_completato')).toMatch(/completato/i);
  });
});
