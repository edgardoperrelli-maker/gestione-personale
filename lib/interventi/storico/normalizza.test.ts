// lib/interventi/storico/normalizza.test.ts
import { describe, it, expect } from 'vitest';
import {
  anagraficaManuale, interventoToRigaStorico, manualeToRigaStorico,
  labelStatoStorico, labelEsitoStorico, ordinaRighe, filtraManualiInMemoria, slicePagina,
} from './normalizza';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico } from './types';

const staff = new Map<string, string>([['s1', 'Mario Rossi']]);

describe('anagraficaManuale', () => {
  it('dati_correnti vince su dati_operatore', () => {
    const a = anagraficaManuale({
      dati_correnti: { anagrafica: { via: 'Via A', odl: '111' } },
      dati_operatore: { anagrafica: { via: 'Via B', matricola: 'M9', comune: 'Roma' } },
    });
    expect(a.via).toBe('Via A');
    expect(a.odl).toBe('111');
    expect(a.matricola).toBe('M9');
    expect(a.comune).toBe('Roma');
  });
  it('jsonb assenti → tutte stringhe vuote', () => {
    const a = anagraficaManuale({ dati_correnti: null, dati_operatore: null });
    expect(a.via).toBe('');
    expect(a.matricola).toBe('');
  });
});

describe('interventoToRigaStorico', () => {
  it('mappa i campi e risolve esecutore + label', () => {
    const row: InterventoStoricoRow = {
      id: 'i1', origine: 'pianificato', committente: 'acea', data: '2026-06-10',
      odl: '200999', pdr: 'P1', matricola_contatore: 'M1', nominativo: 'Tizio',
      indirizzo: 'Via Roma 1', comune: 'Roma', cap: '00100', intervento_tipo: 'Sostituzione',
      fascia_oraria: '8-12', staff_id: 's1', stato: 'completato', esito: 'eseguito_positivo', esito_motivo: null,
    };
    const r = interventoToRigaStorico(row, staff);
    expect(r.origine).toBe('programmato');
    expect(r.matricola).toBe('M1');
    expect(r.attivita).toBe('Sostituzione');
    expect(r.esecutoreNome).toBe('Mario Rossi');
    expect(r.statoLabel).toBe('Completato');
    expect(r.esitoLabel).toBe('Eseguito positivo');
  });
  it('origine=manuale (promosso) resta una sola riga marcata manuale', () => {
    const row = { id: 'i2', origine: 'manuale', committente: 'acea', data: '2026-06-10', odl: null, pdr: null, matricola_contatore: null, nominativo: null, indirizzo: null, comune: null, cap: null, intervento_tipo: null, fascia_oraria: null, staff_id: null, stato: 'completato', esito: null, esito_motivo: null } as InterventoStoricoRow;
    expect(interventoToRigaStorico(row, staff).origine).toBe('manuale');
  });
  it('staff_id presente ma non in mappa → esecutoreNome null', () => {
    const row = { id: 'i3', origine: 'pianificato', committente: 'acea', data: '2026-06-10', odl: null, pdr: null, matricola_contatore: null, nominativo: null, indirizzo: null, comune: null, cap: null, intervento_tipo: null, fascia_oraria: null, staff_id: 's99', stato: 'assegnato', esito: null, esito_motivo: null } as InterventoStoricoRow;
    expect(interventoToRigaStorico(row, staff).esecutoreNome).toBeNull();
  });
});

describe('manualeToRigaStorico', () => {
  it('estrae anagrafica dal jsonb, stato/esito/motivo dai campi richiesta', () => {
    const row: ManualeStoricoRow = {
      id: 'm1', committente: 'lim_massive', data: '2026-06-11', staff_id: 's1', staff_name: 'Mario R.',
      stato: 'rifiutato', motivo_rifiuto: 'doppione',
      dati_correnti: { anagrafica: { via: 'Via B', matricola: 'M2', comune: 'Fiumicino', odl: '300' } },
      dati_operatore: {},
    };
    const r = manualeToRigaStorico(row, staff);
    expect(r.origine).toBe('manuale');
    expect(r.indirizzo).toBe('Via B');
    expect(r.matricola).toBe('M2');
    expect(r.comune).toBe('Fiumicino');
    expect(r.statoLabel).toBe('Rifiutato (manuale)');
    expect(r.esito).toBeNull();
    expect(r.esitoLabel).toBe('—');
    expect(r.motivo).toBe('doppione');
    expect(r.esecutoreNome).toBe('Mario R.');
  });
});

describe('label helper', () => {
  it('labelStatoStorico noti + fallback + null', () => {
    expect(labelStatoStorico('completato')).toBe('Completato');
    expect(labelStatoStorico('in_attesa')).toBe('In attesa (manuale)');
    expect(labelStatoStorico('boh')).toBe('boh');
    expect(labelStatoStorico(null)).toBe('—');
  });
  it('labelEsitoStorico noti + null', () => {
    expect(labelEsitoStorico('accesso_negato')).toBe('Accesso negato');
    expect(labelEsitoStorico(null)).toBe('—');
  });
});

describe('ordinaRighe', () => {
  it('ordina per data desc, poi comune asc, poi indirizzo asc', () => {
    const base = (p: Partial<RigaStorico>): RigaStorico => ({
      id: '', origine: 'programmato', committente: null, data: null, odl: null, pdr: null, matricola: null,
      nominativo: null, indirizzo: null, comune: null, cap: null, attivita: null, fascia_oraria: null,
      esecutoreId: null, esecutoreNome: null, stato: null, statoLabel: '—', esito: null, esitoLabel: '—', motivo: null, ...p,
    });
    const out = ordinaRighe([
      base({ id: 'a', data: '2026-06-01', comune: 'Roma' }),
      base({ id: 'b', data: '2026-06-10', comune: 'Bari' }),
      base({ id: 'c', data: '2026-06-10', comune: 'Aosta' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('filtraManualiInMemoria', () => {
  const r = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', origine: 'manuale', committente: null, data: null, odl: null, pdr: null, matricola: null,
    nominativo: null, indirizzo: null, comune: null, cap: null, attivita: null, fascia_oraria: null,
    esecutoreId: null, esecutoreNome: null, stato: null, statoLabel: '—', esito: null, esitoLabel: '—', motivo: null, ...p,
  });
  it('filtra per q su odl/indirizzo/matricola/pdr/nominativo (case-insensitive)', () => {
    const righe = [r({ id: 'a', odl: '200ABC' }), r({ id: 'b', indirizzo: 'Via Verdi' })];
    expect(filtraManualiInMemoria(righe, '200abc', '').map((x) => x.id)).toEqual(['a']);
    expect(filtraManualiInMemoria(righe, 'verdi', '').map((x) => x.id)).toEqual(['b']);
  });
  it('filtra per comune (contains)', () => {
    const righe = [r({ id: 'a', comune: 'Roma' }), r({ id: 'b', comune: 'Fiumicino' })];
    expect(filtraManualiInMemoria(righe, '', 'fium').map((x) => x.id)).toEqual(['b']);
  });
});

describe('slicePagina', () => {
  it('estrae la pagina richiesta', () => {
    const righe = Array.from({ length: 5 }, (_, i) => ({ id: String(i) } as unknown as RigaStorico));
    expect(slicePagina(righe, 1, 2).map((r) => r.id)).toEqual(['2', '3']);
  });
});
