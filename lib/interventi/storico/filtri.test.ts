// lib/interventi/storico/filtri.test.ts
import { describe, it, expect } from 'vitest';
import { parseFiltriStorico, risolviFinestra, interrogaInterventi, interrogaManuali, puliziaQ } from './filtri';

const OGGI = '2026-06-17';

describe('parseFiltriStorico', () => {
  it('default vuoto: q vuota, date nulle, page 0', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(f).toEqual({ q: '', data: null, dal: null, al: null, esecutore: null, comune: '', committente: null, stato: null, esito: null, page: 0 });
  });
  it('q trimmata; range date validi; valori invalidi → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: '  200123  ', dal: '2026-06-01', al: 'xx', committente: 'acea', stato: 'completato', esito: 'rinviato', esecutore: ' s1 ', comune: ' Roma ', page: '3' }), OGGI);
    expect(f.q).toBe('200123');
    expect(f.dal).toBe('2026-06-01');
    expect(f.al).toBeNull();
    expect(f.committente).toBe('acea');
    expect(f.stato).toBe('completato');
    expect(f.esito).toBe('rinviato');
    expect(f.esecutore).toBe('s1');
    expect(f.comune).toBe('Roma');
    expect(f.page).toBe(3);
  });
  it('committente/stato/esito non riconosciuti → null', () => {
    const f = parseFiltriStorico(new URLSearchParams({ committente: 'pippo', stato: 'x', esito: 'y' }), OGGI);
    expect(f.committente).toBeNull();
    expect(f.stato).toBeNull();
    expect(f.esito).toBeNull();
  });
});

describe('risolviFinestra', () => {
  it('q presente → nessun vincolo data (tutto lo storico)', () => {
    const f = parseFiltriStorico(new URLSearchParams({ q: 'abc', dal: '2026-06-01' }), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: null, lte: null });
  });
  it('senza q e senza date → giorno corrente', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: OGGI, gte: null, lte: null });
  });
  it('range date → gte/lte', () => {
    const f = parseFiltriStorico(new URLSearchParams({ dal: '2026-06-01', al: '2026-06-10' }), OGGI);
    expect(risolviFinestra(f, OGGI)).toEqual({ eq: null, gte: '2026-06-01', lte: '2026-06-10' });
  });
});

describe('interrogaInterventi / interrogaManuali', () => {
  it('di default interroga entrambe', () => {
    const f = parseFiltriStorico(new URLSearchParams(), OGGI);
    expect(interrogaInterventi(f)).toBe(true);
    expect(interrogaManuali(f)).toBe(true);
  });
  it('esito impostato → niente manuali (esito è solo interventi)', () => {
    const f = parseFiltriStorico(new URLSearchParams({ esito: 'rinviato' }), OGGI);
    expect(interrogaManuali(f)).toBe(false);
    expect(interrogaInterventi(f)).toBe(true);
  });
  it('stato manuale (in_attesa) → niente interventi', () => {
    const f = parseFiltriStorico(new URLSearchParams({ stato: 'in_attesa' }), OGGI);
    expect(interrogaInterventi(f)).toBe(false);
    expect(interrogaManuali(f)).toBe(true);
  });
  it('stato condiviso (annullato) → entrambe', () => {
    const f = parseFiltriStorico(new URLSearchParams({ stato: 'annullato' }), OGGI);
    expect(interrogaInterventi(f)).toBe(true);
    expect(interrogaManuali(f)).toBe(true);
  });
  it('stato manuale (rifiutato) → niente interventi', () => {
    const f = parseFiltriStorico(new URLSearchParams({ stato: 'rifiutato' }), OGGI);
    expect(interrogaInterventi(f)).toBe(false);
    expect(interrogaManuali(f)).toBe(true);
  });
});

describe('puliziaQ', () => {
  it('trim e rimozione caratteri che rompono il filtro PostgREST', () => {
    expect(puliziaQ('  ab,c(%)*  ')).toBe('ab c');
  });
  it('stringa vuota resta vuota', () => {
    expect(puliziaQ('   ')).toBe('');
  });
});
