import { describe, it, expect } from 'vitest';
import { filtraTaskRendicontati, tuttiTaskRendicontatiAltrove } from './taskRendicontati';

describe('filtraTaskRendicontati (G1)', () => {
  it('task con task_id già fra le voci superstiti (acea/manuali) → escluso', () => {
    const tasks = [
      { id: 'acea:i1', odl: '912215286' },
      { id: 'row-2', odl: 'ALTRO' },
    ];
    const voci = [{ task_id: 'acea:i1', odl: '912215286', matricola: null, origine: 'acea' }];
    expect(filtraTaskRendicontati(tasks, voci).map((t) => t.id)).toEqual(['row-2']);
  });

  it('cintura per unità: task row-N con lo stesso ODL della voce acea → escluso (transizione master/registro)', () => {
    const tasks = [{ id: 'row-9', odl: '912215286' }];
    const voci = [{ task_id: 'acea:i1', odl: '912215286', matricola: null, origine: 'acea' }];
    expect(filtraTaskRendicontati(tasks, voci)).toEqual([]);
  });

  it('la cintura ODL NON scatta per una voce MANUALE: il «+» può condividere l’ODL con un task legittimo', () => {
    // Regressione FIRENZE/PERUGIA/LAZIO: filtrare il task per l'ODL di una voce manuale
    // cancellerebbe la sua voce da-task (con le risposte) senza ricrearla.
    const tasks = [{ id: 'row-5', odl: 'X100' }];
    const voci = [{ task_id: null, odl: 'X100', matricola: null, origine: 'manuale' }];
    expect(filtraTaskRendicontati(tasks, voci).map((t) => t.id)).toEqual(['row-5']);
    // Anche senza origine (fallback pre-migration: nessuna voce acea esiste) la cintura resta spenta.
    expect(filtraTaskRendicontati(tasks, [{ task_id: null, odl: 'X100', matricola: null }]).map((t) => t.id)).toEqual(['row-5']);
  });

  it('un task con voce da-task COMPILATA non si filtra MAI (né per ODL né per task_id)', () => {
    // «Una voce già compilata non si tocca mai»: filtrare = delete senza ricreazione = lavoro perso.
    const compilati = new Set(['row-5', 'acea:i1']);
    const voci = [
      { task_id: 'acea:i1', odl: 'X100', matricola: null, origine: 'acea' },
      { task_id: null, odl: 'Y200', matricola: null, origine: 'acea' },
    ];
    const tasks = [{ id: 'row-5', odl: 'Y200' }, { id: 'acea:i1', odl: 'X100' }];
    expect(
      filtraTaskRendicontati(tasks, voci, { taskConRisposte: compilati }).map((t) => t.id),
    ).toEqual(['row-5', 'acea:i1']);
  });

  it('acqualatina: stesso ODL ma matricole DIVERSE (entrambe presenti) NON è la stessa unità', () => {
    // Un ordine copre più contatori: la voce del contatore M2 non copre il task del contatore M1.
    const tasks = [{ id: 'row-1', odl: 'X100', matricola: 'M1' }];
    const voci = [{ task_id: 'acea:i2', odl: 'X100', matricola: 'M2', origine: 'acea' }];
    expect(filtraTaskRendicontati(tasks, voci).map((t) => t.id)).toEqual(['row-1']);
  });

  it('matricola assente da una delle due parti: decide l’ODL da solo (unità ACEA)', () => {
    const voci = [{ task_id: 'acea:i3', odl: 'X100', matricola: 'M2', origine: 'acea' }];
    expect(filtraTaskRendicontati([{ id: 'row-1', odl: 'X100' }], voci)).toEqual([]);
    const vociSenzaMatricola = [{ task_id: 'acea:i3', odl: 'X100', matricola: null, origine: 'acea' }];
    expect(filtraTaskRendicontati([{ id: 'row-1', odl: 'X100', matricola: 'M1' }], vociSenzaMatricola)).toEqual([]);
  });

  it('senza voci superstiti non filtra niente; task senza ODL passa se il task_id non matcha', () => {
    const tasks = [{ id: 'row-1', odl: '' }, { id: 'row-2' }];
    expect(filtraTaskRendicontati(tasks, [])).toHaveLength(2);
    expect(filtraTaskRendicontati(tasks, [{ task_id: 'acea:i9', odl: 'Q', matricola: null, origine: 'acea' }])).toHaveLength(2);
  });
});

describe('tuttiTaskRendicontatiAltrove (G2)', () => {
  it('tutti i task acea:* già rendicontati altrove → true (nessun rapportino da creare)', () => {
    const altrove = new Set(['acea:i1', 'acea:i2']);
    expect(tuttiTaskRendicontatiAltrove(
      [{ id: 'acea:i1' }, { id: 'acea:i2' }], altrove,
    )).toBe(true);
  });

  it('un task Excel (row-N) nel piano basta a richiedere il rapportino', () => {
    const altrove = new Set(['acea:i1']);
    expect(tuttiTaskRendicontatiAltrove(
      [{ id: 'acea:i1' }, { id: 'row-3' }], altrove,
    )).toBe(false);
  });

  it('un task acea:* NON ancora rendicontato basta a richiedere il rapportino', () => {
    const altrove = new Set(['acea:i1']);
    expect(tuttiTaskRendicontatiAltrove(
      [{ id: 'acea:i1' }, { id: 'acea:i2' }], altrove,
    )).toBe(false);
  });

  it('nessun task → false: un piano vuoto non è «già rendicontato»', () => {
    expect(tuttiTaskRendicontatiAltrove([], new Set(['acea:i1']))).toBe(false);
  });
});
