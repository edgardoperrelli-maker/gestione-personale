import { describe, it, expect } from 'vitest';
import {
  riepilogoEsiti, scegliRapportino, taskIdAcea, vociDaAggiungere,
  type EsitoOperatore, type InterventoDaVoce, type VoceEsistente,
} from './vociRapportino';

const int = (over: Partial<InterventoDaVoce> = {}): InterventoDaVoce => ({
  id: 'i1', odl: '912215286', staff_id: 's1',
  intervento_tipo: 'LIMITAZIONI MASSIVE', gruppo_attivita: 'LIMITAZIONI MASSIVE',
  committente: 'lim_massive', indirizzo: 'VIA ALFA 1', comune: 'LABICO', cap: '00030',
  matricola_contatore: '202015213300', nominativo: null, pdr: null,
  ...over,
});

const voce = (over: Partial<VoceEsistente> = {}): VoceEsistente => ({
  task_id: null, intervento_id: null, odl: null, ordine: null, ...over,
});

describe('vociDaAggiungere', () => {
  it('su un rapportino vuoto aggiunge tutto, partendo da ordine 1', () => {
    const r = vociDaAggiungere([int({ id: 'a' }), int({ id: 'b', odl: '999' })], []);
    expect(r.daAggiungere.map((i) => i.id)).toEqual(['a', 'b']);
    expect(r.giaPresenti).toBe(0);
    expect(r.ordineIniziale).toBe(1);
  });

  it('riconosce le proprie voci dal secondo giro: nessun duplicato', () => {
    const gia = [voce({ task_id: taskIdAcea('a'), intervento_id: 'a', odl: '912215286', ordine: 3 })];
    const r = vociDaAggiungere([int({ id: 'a' })], gia);
    expect(r.daAggiungere).toEqual([]);
    expect(r.giaPresenti).toBe(1);
  });

  it('riconosce la voce anche se intervento_id è stato azzerato (FK on delete set null)', () => {
    const gia = [voce({ task_id: taskIdAcea('a'), intervento_id: null, odl: null, ordine: 1 })];
    expect(vociDaAggiungere([int({ id: 'a' })], gia).daAggiungere).toEqual([]);
  });

  it('non duplica un ODL che il vecchio flusso da master ha già messo come voce da task', () => {
    // Il caso della transizione: stesso ODL, altra origine, nessun collegamento all'intervento.
    const gia = [voce({ task_id: 'row-7', intervento_id: 'altro', odl: '912215286', ordine: 7 })];
    const r = vociDaAggiungere([int({ id: 'nuovo' })], gia);
    expect(r.daAggiungere).toEqual([]);
    expect(r.giaPresenti).toBe(1);
  });

  it('confronta gli ODL senza badare a spazi e maiuscole', () => {
    const gia = [voce({ odl: ' 912215286 ', ordine: 1 })];
    expect(vociDaAggiungere([int({ odl: '912215286' })], gia).daAggiungere).toEqual([]);
  });

  it('un ODL vuoto non fa da chiave: due interventi senza ODL restano due voci', () => {
    const gia = [voce({ odl: '', ordine: 1 })];
    const r = vociDaAggiungere([int({ id: 'a', odl: null }), int({ id: 'b', odl: null })], gia);
    expect(r.daAggiungere.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('due interventi sullo stesso ODL nello stesso giro producono una voce sola', () => {
    const r = vociDaAggiungere([int({ id: 'a' }), int({ id: 'b' })], []);
    expect(r.daAggiungere.map((i) => i.id)).toEqual(['a']);
    expect(r.giaPresenti).toBe(1);
  });

  it('si accoda in fondo: le voci Italgas restano prima nel giro dell operatore', () => {
    const gia = [voce({ task_id: 't1', ordine: 4 }), voce({ task_id: 't2', ordine: 11 })];
    expect(vociDaAggiungere([int()], gia).ordineIniziale).toBe(12);
  });
});

describe('vociDaAggiungere — unità ODL+matricola (AcquaLatina)', () => {
  // Un ODL di Terracina copre fino a cinque contatori: ogni matricola è una voce SUA.
  const aq = (over: Partial<InterventoDaVoce> = {}): InterventoDaVoce =>
    int({ committente: 'acqualatina', odl: '100001', ...over });

  it('cinque contatori dello stesso ODL sono cinque voci, non quattro «già presenti»', () => {
    const r = vociDaAggiungere(
      ['A', 'B', 'C', 'D', 'E'].map((m, k) => aq({ id: `i${k}`, matricola_contatore: `MTR-${m}` })),
      [],
      'odl_matricola',
    );
    expect(r.daAggiungere).toHaveLength(5);
    expect(r.giaPresenti).toBe(0);
  });

  it('la voce esistente copre solo la SUA matricola', () => {
    const gia = [voce({ task_id: 'x', odl: '100001', matricola: 'MTR-A', ordine: 1 })];
    const r = vociDaAggiungere(
      [aq({ id: 'a', matricola_contatore: 'MTR-A' }), aq({ id: 'b', matricola_contatore: 'MTR-B' })],
      gia,
      'odl_matricola',
    );
    expect(r.daAggiungere.map((i) => i.id)).toEqual(['b']);
    expect(r.giaPresenti).toBe(1);
  });

  it('il confronto matricola è sul normalizzato: «mtr-a» copre «MTRA»', () => {
    const gia = [voce({ odl: '100001', matricola: 'mtr-a', ordine: 1 })];
    const r = vociDaAggiungere([aq({ matricola_contatore: 'MTRA' })], gia, 'odl_matricola');
    expect(r.daAggiungere).toEqual([]);
  });

  it('con l\'unità di default (ACEA) il comportamento resta per ODL', () => {
    const r = vociDaAggiungere(
      [int({ id: 'a', matricola_contatore: 'X1' }), int({ id: 'b', matricola_contatore: 'X2' })],
      [],
    );
    // Stesso ODL: la seconda è un doppione, come sempre — l'unità composta è OPT-IN.
    expect(r.daAggiungere.map((i) => i.id)).toEqual(['a']);
  });
});

describe('scegliRapportino', () => {
  const rap = (id: string, stato: string, created_at: string, conVociAcea = false) =>
    ({ id, stato, created_at, conVociAcea });

  it('senza candidati non sceglie niente', () => {
    expect(scegliRapportino([])).toBeNull();
  });

  it('preferisce quello ancora aperto a quello già inviato', () => {
    const scelto = scegliRapportino([
      rap('inviato', 'inviato', '2026-07-01T08:00:00Z', true),
      rap('aperto', 'in_corso', '2026-07-01T09:00:00Z'),
    ]);
    // Anche se l'inviato ospita già voci ACEA: aggiungere dove l'operatore può ancora
    // scrivere batte la continuità, perché non costa una riapertura.
    expect(scelto?.id).toBe('aperto');
  });

  it('fra due aperti preferisce quello che ospita già voci ACEA', () => {
    const scelto = scegliRapportino([
      rap('altro', 'in_corso', '2026-07-01T08:00:00Z'),
      rap('conAcea', 'in_corso', '2026-07-01T09:00:00Z', true),
    ]);
    expect(scelto?.id).toBe('conAcea');
  });

  it('a parità sceglie il più vecchio, e la scelta è stabile', () => {
    const lista = [
      rap('b', 'in_corso', '2026-07-01T09:00:00Z'),
      rap('a', 'in_corso', '2026-07-01T07:00:00Z'),
    ];
    expect(scegliRapportino(lista)?.id).toBe('a');
    expect(scegliRapportino([...lista].reverse())?.id).toBe('a');
  });

  it('con created_at assente su tutti usa l id come spareggio', () => {
    const scelto = scegliRapportino([
      { id: 'z', stato: 'in_corso', created_at: null, conVociAcea: false },
      { id: 'a', stato: 'in_corso', created_at: null, conVociAcea: false },
    ]);
    expect(scelto?.id).toBe('a');
  });
});

describe('riepilogoEsiti', () => {
  it('conta ogni esito, anche quelli a zero', () => {
    const e = (esito: EsitoOperatore['esito']): EsitoOperatore => ({
      staff_id: 's', staff_name: null, esito, rapportino_id: null, url: null,
      interventi: 0, voci_aggiunte: 0, voci_gia_presenti: 0,
    });
    expect(riepilogoEsiti([e('creato'), e('aggiunto'), e('aggiunto')])).toEqual({
      creato: 1, aggiunto: 2, richiede_riapertura: 0, nessuna_modifica: 0,
    });
  });
});
