import { describe, it, expect } from 'vitest';
import { mapInterventoToTask, buildDistribuzionePayload, type InterventoGeoRow } from './mappaInterventi';

function row(overrides: Partial<InterventoGeoRow> = {}): InterventoGeoRow {
  return {
    id: 'uuid-1',
    odl: 'ODL-1',
    indirizzo: 'Via Roma 1',
    comune: 'Roma',
    committente: 'acea',
    stato: 'da_assegnare',
    geocode_status: 'ok',
    nominativo: 'Mario Rossi',
    fascia_oraria: '9-12',
    staff_id: null,
    lat: 41.9,
    lng: 12.5,
    cap: '00100',
    pdr: 'PDR-1',
    matricola_contatore: 'M123',
    intervento_tipo: 'Sostituzione',
    codice_servizio: 'S-AI-001',
    richiede_due_operatori: true,
    data: '2026-06-04',
    ...overrides,
  };
}

describe('mapInterventoToTask', () => {
  it('mappa tutti i campi di una riga completa', () => {
    const t = mapInterventoToTask(row());
    expect(t).toEqual({
      id: 'uuid-1',
      odl: 'ODL-1',
      pdr: 'PDR-1',
      indirizzo: 'Via Roma 1',
      cap: '00100',
      citta: 'Roma',
      priorita: 0,
      fascia_oraria: '9-12',
      lat: 41.9,
      lng: 12.5,
      requiresTwoOperators: true,
      nominativo: 'Mario Rossi',
      matricola: 'M123',
      attivita: 'Sostituzione',
      codice: 'S-AI-001',
    });
  });

  it('rinomina comune→citta, matricola_contatore→matricola, intervento_tipo→attivita, codice_servizio→codice', () => {
    const t = mapInterventoToTask(row({ comune: 'Milano', matricola_contatore: 'X9', intervento_tipo: 'Verifica', codice_servizio: 'C-1' }));
    expect(t.citta).toBe('Milano');
    expect(t.matricola).toBe('X9');
    expect(t.attivita).toBe('Verifica');
    expect(t.codice).toBe('C-1');
  });

  it('applica i default sui campi null (priorita 0, stringhe vuote, undefined)', () => {
    const t = mapInterventoToTask(row({
      odl: null, indirizzo: null, cap: null, comune: null, fascia_oraria: null,
      pdr: null, lat: null, lng: null, richiede_due_operatori: null,
      nominativo: null, matricola_contatore: null, intervento_tipo: null, codice_servizio: null,
    }));
    expect(t.odl).toBe('');
    expect(t.indirizzo).toBe('');
    expect(t.cap).toBe('');
    expect(t.citta).toBe('');
    expect(t.fascia_oraria).toBe('');
    expect(t.priorita).toBe(0);
    expect(t.pdr).toBeUndefined();
    expect(t.lat).toBeUndefined();
    expect(t.lng).toBeUndefined();
    expect(t.requiresTwoOperators).toBeUndefined();
    expect(t.nominativo).toBeUndefined();
    expect(t.matricola).toBeUndefined();
    expect(t.attivita).toBeUndefined();
    expect(t.codice).toBeUndefined();
  });
});

describe('buildDistribuzionePayload', () => {
  it('genera ordine 1-based per operatore e fa flatten', () => {
    const piano = [
      { staffId: 's1', tasks: [{ id: 'a' }, { id: 'b' }] },
      { staffId: 's2', tasks: [{ id: 'c' }] },
    ];
    expect(buildDistribuzionePayload(piano)).toEqual([
      { intervento_id: 'a', staff_id: 's1', ordine: 1 },
      { intervento_id: 'b', staff_id: 's1', ordine: 2 },
      { intervento_id: 'c', staff_id: 's2', ordine: 1 },
    ]);
  });

  it('lista vuota → []', () => {
    expect(buildDistribuzionePayload([])).toEqual([]);
  });

  it('operatore senza task → nessuna riga', () => {
    const piano = [{ staffId: 's1', tasks: [] }, { staffId: 's2', tasks: [{ id: 'x' }] }];
    expect(buildDistribuzionePayload(piano)).toEqual([{ intervento_id: 'x', staff_id: 's2', ordine: 1 }]);
  });
});
