import { describe, it, expect } from 'vitest';
import { buildVoceManuale, colonneAnagraficaVoce } from './buildVoceManuale';
import type { DatiInterventoManuale } from './types';

const dati: DatiInterventoManuale = {
  committente: 'acea',
  anagrafica: {
    nominativo: 'Mario Rossi', matricola: 'M1', pdr: 'PDR1', odl: 'ODL9',
    via: 'Via Roma 1', comune: 'Roma', cap: '00100', recapito: '333',
    attivita: 'Sostituzione', accessibilita: 'Libero', fascia_oraria: '9-12',
    coordinate: '41.9, 12.5',
  },
  risposte: { att_cess: true, note: 'urgente' },
};

describe('buildVoceManuale', () => {
  it('mappa anagrafica → colonne voce (odl→odl) + manuale/approvazione', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 7, dati });
    expect(v).toMatchObject({
      rapportino_id: 'rap1',
      richiesta_id: 'req1',
      ordine: 7,
      manuale: true,
      approvazione_stato: 'in_attesa',
      nominativo: 'Mario Rossi',
      matricola: 'M1',
      pdr: 'PDR1',
      odl: 'ODL9',
      via: 'Via Roma 1',
      comune: 'Roma',
      cap: '00100',
      recapito: '333',
      attivita: 'Sostituzione',
      accessibilita: 'Libero',
      fascia_oraria: '9-12',
      risposte: { att_cess: true, note: 'urgente' },
    });
  });
  it('porta la coordinata nel raw_json e marca _nuovo', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati });
    expect(v.raw_json).toMatchObject({ coordinate: '41.9, 12.5', _nuovo: true });
  });
  it('campi assenti → null/undefined senza crash', () => {
    const vuoto: DatiInterventoManuale = { committente: 'altro', anagrafica: {}, risposte: {} };
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati: vuoto });
    expect(v.nominativo ?? null).toBeNull();
    expect(v.risposte).toEqual({});
  });

  // Prima del fix, la voce nasceva SEMPRE senza template_id/campi_snapshot: a render la voce
  // ripiegava sempre sul modulo del rapportino padre, giusto solo per coincidenza quando quel
  // rapportino era dello stesso flusso della voce (caso BONIFICHE EXTRA sotto un rapportino
  // AcquaLatina: il "+" ereditava la matricola nuova del misuratore AcquaLatina).
  it('senza flusso risolto (templateId/campi assenti), congela null: la voce eredita il rapportino come prima', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati });
    expect(v.template_id).toBeNull();
    expect(v.campi_snapshot).toBeNull();
  });

  it('con flusso risolto, congela template_id e campi sulla voce', () => {
    const campi = [{ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', obbligatoria: true, ordine: 1 }] as never;
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati, templateId: 'tpl-bonifiche-extra', campi });
    expect(v.template_id).toBe('tpl-bonifiche-extra');
    expect(v.campi_snapshot).toEqual(campi);
  });

  it('campi vuoto ([]) equivale a nessun flusso: congela null, non un array vuoto', () => {
    const v = buildVoceManuale({ rapportinoId: 'rap1', richiestaId: 'req1', ordine: 1, dati, templateId: 'tpl-x', campi: [] });
    expect(v.campi_snapshot).toBeNull();
  });
});

describe('colonneAnagraficaVoce (riallineamento voce in approvazione)', () => {
  it('mappa l\'anagrafica corretta dal backoffice sulle colonne (PDR aggiunta, matricola corretta)', () => {
    const corretti: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { via: 'VIA A', matricola: 'MTSB033207656306', pdr: '00882101957377' },
      risposte: { eseguito: 'SI' },
    };
    expect(colonneAnagraficaVoce(corretti)).toMatchObject({
      via: 'VIA A',
      matricola: 'MTSB033207656306',
      pdr: '00882101957377',
      risposte: { eseguito: 'SI' },
    });
  });
  it('rifila spazi/tab dei valori e mappa il vuoto a null', () => {
    const d: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { pdr: '  00882101961924\t', matricola: '' },
      risposte: {},
    };
    const c = colonneAnagraficaVoce(d);
    expect(c.pdr).toBe('00882101961924');
    expect(c.matricola).toBeNull();
  });
});

/**
 * Regressione del 27/07 → 03/08. `rapportino_voci.origine` ha default 'task', e
 * `sincronizzaRapportini` cancella tutte le voci 'task' per rigenerarle dai task del piano.
 * Una voce del «+» lasciata al default veniva rasa via alla prima rigenerazione e non ricreata
 * — non è un task del piano — facendo sparire il lavoro aggiunto in campo, senza errori.
 */
describe('buildVoceManuale · proprietà della voce', () => {
  const dati: DatiInterventoManuale = {
    committente: 'acea',
    anagrafica: { odl: '123', via: 'VIA ROMA 1' },
    risposte: {},
  };

  it("dichiara origine 'manuale': il motore dei piani non deve poterla toccare", () => {
    const voce = buildVoceManuale({ rapportinoId: 'r1', richiestaId: 'q1', ordine: 3, dati });
    expect(voce.origine).toBe('manuale');
  });

  it('non lascia mai origine al default del database', () => {
    const voce = buildVoceManuale({ rapportinoId: 'r1', richiestaId: 'q1', ordine: 1, dati });
    expect(voce.origine).not.toBe('task');
    // `manuale` da solo non basta più: dal 27/07 il motore filtra su `origine`, non su questo.
    expect(voce.manuale).toBe(true);
  });
});
