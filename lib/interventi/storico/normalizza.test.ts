// lib/interventi/storico/normalizza.test.ts
import { describe, it, expect } from 'vitest';
import { buildTassonomiaIndex, chiaveTassonomia } from '@/lib/attivita/tassonomia';
import {
  siNo, voceToRigaStorico, interventoPiToRigaStorico, ordinaRighe, slicePagina,
  filtraSiNo, filtraCommittenteGruppo, calcolaContatori, type InterventoPiRow,
} from './normalizza';
import type { VoceStoricoRow, RigaStorico } from './types';

const staff = new Map<string, string>([['s1', 'Mario Rossi']]);

const tassonomia = buildTassonomiaIndex([
  { committente: 'acea', descrizione: 'Limitazione flusso idrico', descrizioneNorm: chiaveTassonomia('Limitazione flusso idrico'), gruppo: 'DUNNING', attivo: true },
  { committente: 'italgas', descrizione: 'S-PR-007 A', descrizioneNorm: chiaveTassonomia('S-PR-007 A'), gruppo: "ATTIVITA' ALLA CLIENTELA", attivo: true },
]);

describe('siNo', () => {
  it('varianti SI', () => {
    expect(siNo('SI')).toBe('SI');
    expect(siNo('true')).toBe('SI');
    expect(siNo('x')).toBe('SI');
    expect(siNo('1')).toBe('SI');
  });
  it('varianti NO', () => {
    expect(siNo('NO')).toBe('NO');
    expect(siNo('false')).toBe('NO');
  });
  it('vuoto/null/undefined → —', () => {
    expect(siNo(null)).toBe('—');
    expect(siNo(undefined)).toBe('—');
    expect(siNo('')).toBe('—');
    expect(siNo('   ')).toBe('—');
  });
  it('valore inatteso → grezzo', () => {
    expect(siNo('FORSE')).toBe('FORSE');
  });
});

describe('voceToRigaStorico', () => {
  it('mappa campi, risposte e esecutore (embed oggetto)', () => {
    const row: VoceStoricoRow = {
      id: 'v1', odl: '200999', via: 'Via Roma 1', comune: 'Roma', matricola: 'M1', nominativo: 'Tizio', pdr: 'P1',
      attivita: 'LIMITAZIONI MASSIVE',
      risposte: { eseguito: 'SI', sostituzione_valvola: 'true', mini_bag: 'true', rg_stop: null, note: 'ok ', sigillo: 'AA728566' },
      manuale: false,
      rapportini: { staff_id: 's1', staff_name: 'DE SANTIS', data: '2026-06-10' },
    };
    const r = voceToRigaStorico(row, staff);
    expect(r.odl).toBe('200999');
    expect(r.pdr).toBe('P1');
    expect(r.matricola).toBe('M1');
    expect(r.sigillo).toBe('AA728566');
    expect(r.data).toBe('2026-06-10');
    expect(r.esecutore).toBe('DE SANTIS');
    expect(r.via).toBe('Via Roma 1');
    expect(r.gruppoAttivita).toBe('LIMITAZIONI MASSIVE');
    expect(r.eseguito).toBe('SI');
    expect(r.sostValvola).toBe('SI');
    expect(r.miniBag).toBe('SI');
    expect(r.rgStop).toBe('—');
    expect(r.note).toBe('ok');
  });
  it('chiave minibag alternativa + embed come array + fallback esecutore da mappa', () => {
    const row = {
      id: 'v2', odl: null, via: null, comune: null, matricola: null, nominativo: null, pdr: null,
      risposte: { minibag: 'true' }, manuale: true,
      rapportini: [{ staff_id: 's1', staff_name: null, data: '2026-06-09' }],
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff);
    expect(r.miniBag).toBe('SI');
    expect(r.esecutore).toBe('Mario Rossi'); // fallback dalla mappa staff
    expect(r.data).toBe('2026-06-09');
    expect(r.eseguito).toBe('—');
    expect(r.note).toBeNull();
  });
  it('risposte null → tutti i campi SI/NO a —', () => {
    const row = {
      id: 'v3', odl: '1', via: 'X', comune: null, matricola: null, nominativo: null, pdr: null,
      risposte: null, manuale: false, rapportini: { staff_id: null, staff_name: 'OP', data: '2026-06-01' },
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff);
    expect(r.eseguito).toBe('—');
    expect(r.sostValvola).toBe('—');
    expect(r.sigillo).toBeNull();
    expect(r.esecutore).toBe('OP');
    expect(r.committente).toBeNull(); // nessun intervento collegato
  });
  it('committente/gruppo dall\'intervento collegato (lim_massive → acea)', () => {
    const row = {
      id: 'v4', odl: '1', via: 'X', comune: null, matricola: null, nominativo: null, pdr: null,
      attivita: 'LIMITAZIONI MASSIVE', risposte: {}, manuale: false,
      rapportini: { staff_id: 's1', staff_name: null, data: '2026-06-01' },
      interventi: { committente: 'lim_massive', gruppo_attivita: 'LIMITAZIONI MASSIVE' },
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff, tassonomia);
    expect(r.committente).toBe('acea');
    expect(r.gruppo).toBe('LIMITAZIONI MASSIVE');
  });
  it('gruppo dal lookup tassonomia quando l\'intervento non lo ha (voce non collegata → tenta acea/italgas)', () => {
    const row = {
      id: 'v5', odl: '1', via: 'X', comune: null, matricola: null, nominativo: null, pdr: null,
      attivita: 's-pr-007 a', risposte: {}, manuale: false,
      rapportini: { staff_id: 's1', staff_name: null, data: '2026-06-01' },
    } as unknown as VoceStoricoRow;
    const r = voceToRigaStorico(row, staff, tassonomia);
    expect(r.committente).toBeNull();
    expect(r.gruppo).toBe("ATTIVITA' ALLA CLIENTELA");
  });
  it('descrizione fuori tassonomia e niente intervento → gruppo null', () => {
    const row = {
      id: 'v6', odl: '1', via: 'X', comune: null, matricola: null, nominativo: null, pdr: null,
      attivita: 'ATTIVITA MISTERIOSA', risposte: {}, manuale: false,
      rapportini: { staff_id: 's1', staff_name: null, data: '2026-06-01' },
    } as unknown as VoceStoricoRow;
    expect(voceToRigaStorico(row, staff, tassonomia).gruppo).toBeNull();
  });
});

describe('interventoPiToRigaStorico', () => {
  const rowPi = (p: Partial<InterventoPiRow>): InterventoPiRow => ({
    id: 'pi1', indirizzo: 'Via Blu 2', comune: 'Roma', data: '2026-07-01', staff_id: 's1',
    rif_esterno: 'R1', intervento_tipo: null, committente: 'italgas', gruppo_attivita: null,
    esito: 'eseguito_positivo', esito_motivo: null, ...p,
  });
  it('committente dalla riga e gruppo di default P.I.', () => {
    const r = interventoPiToRigaStorico(rowPi({}), staff, tassonomia);
    expect(r.committente).toBe('italgas');
    expect(r.gruppo).toBe('P.I.');
    expect(r.eseguito).toBe('SI');
  });
  it('gruppo scritto sull\'intervento vince sul default', () => {
    const r = interventoPiToRigaStorico(rowPi({ gruppo_attivita: 'P.I. SPECIALE' }), staff, tassonomia);
    expect(r.gruppo).toBe('P.I. SPECIALE');
  });
});

describe('ordinaRighe', () => {
  const base = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', odl: null, pdr: null, matricola: null, sigillo: null, data: null, esecutore: null, via: null, gruppoAttivita: null,
    committente: null, gruppo: null,
    eseguito: '—', sostValvola: '—', miniBag: '—', rgStop: '—', note: null, ...p,
  });
  it('ordina per data desc, poi via asc, poi id', () => {
    const out = ordinaRighe([
      base({ id: 'a', data: '2026-06-01', via: 'Roma' }),
      base({ id: 'b', data: '2026-06-10', via: 'Bari' }),
      base({ id: 'c', data: '2026-06-10', via: 'Aosta' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('filtraSiNo', () => {
  const r = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', odl: null, pdr: null, matricola: null, sigillo: null, data: null, esecutore: null, via: null, gruppoAttivita: null,
    committente: null, gruppo: null,
    eseguito: '—', sostValvola: '—', miniBag: '—', rgStop: '—', note: null, ...p,
  });
  const noFilt = { eseguito: null, sostValvola: null, miniBag: null, rgStop: null } as const;
  it('nessun filtro → tutte', () => {
    const righe = [r({ id: 'a', eseguito: 'SI' }), r({ id: 'b', eseguito: 'NO' })];
    expect(filtraSiNo(righe, noFilt).length).toBe(2);
  });
  it('eseguito SI → solo SI', () => {
    const righe = [r({ id: 'a', eseguito: 'SI' }), r({ id: 'b', eseguito: 'NO' }), r({ id: 'c', eseguito: '—' })];
    expect(filtraSiNo(righe, { ...noFilt, eseguito: 'SI' }).map((x) => x.id)).toEqual(['a']);
  });
  it('eseguito NO → NO e — (non risulta SI)', () => {
    const righe = [r({ id: 'a', eseguito: 'SI' }), r({ id: 'b', eseguito: 'NO' }), r({ id: 'c', eseguito: '—' })];
    expect(filtraSiNo(righe, { ...noFilt, eseguito: 'NO' }).map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('mini bag SI (crocetta) → solo i SI', () => {
    const righe = [r({ id: 'a', miniBag: 'SI' }), r({ id: 'b', miniBag: '—' })];
    expect(filtraSiNo(righe, { ...noFilt, miniBag: 'SI' }).map((x) => x.id)).toEqual(['a']);
  });
  it('combinazione AND di più filtri', () => {
    const righe = [r({ id: 'a', eseguito: 'SI', sostValvola: 'SI' }), r({ id: 'b', eseguito: 'SI', sostValvola: '—' })];
    expect(filtraSiNo(righe, { ...noFilt, eseguito: 'SI', sostValvola: 'SI' }).map((x) => x.id)).toEqual(['a']);
  });
});

describe('filtraCommittenteGruppo', () => {
  const r = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', odl: null, pdr: null, matricola: null, sigillo: null, data: null, esecutore: null, via: null, gruppoAttivita: null,
    committente: null, gruppo: null,
    eseguito: '—', sostValvola: '—', miniBag: '—', rgStop: '—', note: null, ...p,
  });
  const righe = [
    r({ id: 'a', committente: 'acea', gruppo: 'DUNNING' }),
    r({ id: 'b', committente: 'acea', gruppo: 'LIMITAZIONI MASSIVE' }),
    r({ id: 'c', committente: 'italgas', gruppo: 'BONIFICHE' }),
    r({ id: 'd' }), // voce legacy senza intervento collegato
  ];
  it('liste vuote → tutte le righe (stesso array)', () => {
    expect(filtraCommittenteGruppo(righe, { committenti: [], gruppi: [] })).toBe(righe);
  });
  it('multi committente in OR; righe senza valore escluse', () => {
    expect(filtraCommittenteGruppo(righe, { committenti: ['acea', 'italgas'], gruppi: [] }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('multi gruppo in OR, case-insensitive', () => {
    expect(filtraCommittenteGruppo(righe, { committenti: [], gruppi: ['dunning', 'BONIFICHE'] }).map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('committente e gruppo in AND; lim_massive nel filtro equivale ad acea', () => {
    expect(filtraCommittenteGruppo(righe, { committenti: ['lim_massive'], gruppi: ['LIMITAZIONI MASSIVE'] }).map((x) => x.id)).toEqual(['b']);
  });
});

describe('calcolaContatori', () => {
  const r = (p: Partial<RigaStorico>): RigaStorico => ({
    id: '', odl: null, pdr: null, matricola: null, sigillo: null, data: null, esecutore: null, via: null, gruppoAttivita: null,
    committente: null, gruppo: null,
    eseguito: '—', sostValvola: '—', miniBag: '—', rgStop: '—', note: null, ...p,
  });
  it('conta esitati/eseguiti/negativi e i SI dei campi', () => {
    const righe = [
      r({ eseguito: 'SI', sostValvola: 'SI' }),
      r({ eseguito: 'SI', miniBag: 'SI', rgStop: 'SI' }),
      r({ eseguito: 'NO' }),
      r({ eseguito: '—' }), // non esitato
    ];
    expect(calcolaContatori(righe)).toEqual({
      totale: 4, esitati: 3, eseguiti: 2, negativi: 1, sostValvola: 1, miniBag: 1, rgStop: 1,
    });
  });
  it('insieme vuoto → tutti zero', () => {
    expect(calcolaContatori([])).toEqual({
      totale: 0, esitati: 0, eseguiti: 0, negativi: 0, sostValvola: 0, miniBag: 0, rgStop: 0,
    });
  });
});

describe('slicePagina', () => {
  it('estrae la pagina richiesta', () => {
    const righe = Array.from({ length: 5 }, (_, i) => ({ id: String(i) } as unknown as RigaStorico));
    expect(slicePagina(righe, 1, 2).map((r) => r.id)).toEqual(['2', '3']);
  });
});
