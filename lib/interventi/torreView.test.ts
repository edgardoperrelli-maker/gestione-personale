import { describe, it, expect } from 'vitest';
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, SENTINELLA_NON_ASSEGNATI } from './torreView';

describe('coloreStato', () => {
  it('completato + eseguito_positivo → ok', () => {
    expect(coloreStato('completato', 'eseguito_positivo')).toBe('ok');
  });
  it('completato + causale KO → ko', () => {
    expect(coloreStato('completato', 'accesso_negato')).toBe('ko');
    expect(coloreStato('completato', 'accesso_a_vuoto')).toBe('ko');
  });
  it('assegnato → attesa', () => {
    expect(coloreStato('assegnato', null)).toBe('attesa');
  });
  it('stati intermedi → corso', () => {
    expect(coloreStato('in_viaggio', null)).toBe('corso');
    expect(coloreStato('in_esecuzione', null)).toBe('corso');
  });
  it('da_assegnare e annullato', () => {
    expect(coloreStato('da_assegnare', null)).toBe('da_assegnare');
    expect(coloreStato('annullato', null)).toBe('annullato');
  });
});

describe('raggruppaPerOperatore', () => {
  const operatori = [
    { id: 's1', display_name: 'Mario' },
    { id: 's2', display_name: 'Luigi' },
  ];
  const interventi = [
    { id: 'a', staff_id: 's1', stato: 'completato', esito: 'eseguito_positivo' },
    { id: 'b', staff_id: 's1', stato: 'completato', esito: 'accesso_negato' },
    { id: 'c', staff_id: 's1', stato: 'assegnato', esito: null },
    { id: 'd', staff_id: null, stato: 'da_assegnare', esito: null },
  ];

  it('conteggi corretti per operatore', () => {
    const g = raggruppaPerOperatore(interventi, operatori);
    const s1 = g.find((x) => x.operatore.id === 's1')!;
    expect(s1.conteggi).toEqual({ totale: 3, assegnati: 1, fatti: 1, nonFatti: 1 });
    expect(s1.operatore.display_name).toBe('Mario');
  });

  it('include operatori senza interventi a zero', () => {
    const g = raggruppaPerOperatore(interventi, operatori);
    const s2 = g.find((x) => x.operatore.id === 's2')!;
    expect(s2.conteggi.totale).toBe(0);
    expect(s2.interventi).toHaveLength(0);
  });

  it('crea il gruppo "non assegnati" per staff_id null', () => {
    const g = raggruppaPerOperatore(interventi, operatori);
    const na = g.find((x) => x.operatore.id === null)!;
    expect(na.interventi.map((i) => i.id)).toEqual(['d']);
  });

  it('nessun gruppo non assegnati se tutti hanno operatore', () => {
    const g = raggruppaPerOperatore(
      [{ id: 'a', staff_id: 's1', stato: 'assegnato', esito: null }],
      operatori,
    );
    expect(g.some((x) => x.operatore.id === null)).toBe(false);
  });
});

describe('filtraInterventi', () => {
  const items = [
    { id: 'a', staff_id: 's1', territorio_id: 't1' },
    { id: 'b', staff_id: 's2', territorio_id: 't1' },
    { id: 'c', staff_id: null, territorio_id: 't2' },
  ];

  it('nessun filtro → tutti', () => {
    expect(filtraInterventi(items, null, null)).toHaveLength(3);
  });
  it('filtro territorio', () => {
    expect(filtraInterventi(items, 't1', null).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('filtro operatore', () => {
    expect(filtraInterventi(items, null, 's1').map((i) => i.id)).toEqual(['a']);
  });
  it('filtro "non assegnati" via sentinella', () => {
    expect(filtraInterventi(items, null, SENTINELLA_NON_ASSEGNATI).map((i) => i.id)).toEqual(['c']);
  });
  it('combina territorio + operatore', () => {
    expect(filtraInterventi(items, 't1', 's2').map((i) => i.id)).toEqual(['b']);
  });
});

describe('operatoriVisibili', () => {
  const conteggi = { totale: 0, assegnati: 0, fatti: 0, nonFatti: 0 };
  const mk = (id: string | null, n: number) => ({
    operatore: { id, display_name: id ?? 'Non assegnati' },
    conteggi: { ...conteggi, totale: n },
    interventi: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}` })),
  });
  const gruppi = [mk('s1', 2), mk('s2', 0), mk(null, 1)];

  it('senza territorio → tutti i gruppi', () => {
    expect(operatoriVisibili(gruppi, null)).toHaveLength(3);
  });

  it('con territorio → solo i gruppi con lavori', () => {
    const r = operatoriVisibili(gruppi, 't1');
    expect(r.map((g) => g.operatore.id)).toEqual(['s1', null]);
  });

  it('con territorio e nessun lavoro → vuoto', () => {
    expect(operatoriVisibili([mk('s2', 0)], 't1')).toEqual([]);
  });
});
