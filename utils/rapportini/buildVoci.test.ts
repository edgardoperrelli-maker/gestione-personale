import { describe, it, expect } from 'vitest';
import { taskToVoce, mergeVoci, type Voce, type TemplateCampo } from './buildVoci';
describe('taskToVoce', () => {
  it('snapshot dei campi', () => {
    const t = { id: 'x1', odl: 'O1', pdr: 'P1', indirizzo: 'Via A 1', citta: 'Roma', cap: '00100', nominativo: 'Mario', matricola: 'M1', recapito: '333', accessibilita: 'OK', attivita: 'S-AI-051', fascia_oraria: '8-12' };
    const v = taskToVoce(t, 3);
    expect(v).toMatchObject({ task_id: 'x1', ordine: 3, odl: 'O1', pdr: 'P1', via: 'Via A 1', comune: 'Roma', cap: '00100', nominativo: 'Mario', attivita: 'S-AI-051', fascia_oraria: '8-12' });
    expect(v.raw_json).toEqual(t);
  });
});
describe('mergeVoci', () => {
  const snap = (id: string, ord: number) => ({ task_id: id, ordine: ord, raw_json: {} });
  it('conserva/aggiunge/rimuove per task_id', () => {
    const fromTasks = [snap('a', 1), snap('b', 2)];
    const existing: Voce[] = [ { ...snap('a', 9), risposte: { att_cess: true, note: 'ok' } }, { ...snap('c', 5), risposte: { cambio: true } } ];
    const merged = mergeVoci(fromTasks, existing);
    expect(merged.map((v) => v.task_id).sort()).toEqual(['a', 'b']);
    expect(merged.find((v) => v.task_id === 'a')!.risposte).toEqual({ att_cess: true, note: 'ok' });
    expect(merged.find((v) => v.task_id === 'a')!.ordine).toBe(1);
    expect(merged.find((v) => v.task_id === 'b')!.risposte).toEqual({});
  });
});

describe('TemplateCampo tipo foto', () => {
  it('accetta un campo di tipo foto con flag obbligatoria', () => {
    const campo: TemplateCampo = {
      chiave: 'foto_contatore',
      etichetta: 'Foto contatore',
      tipo: 'foto',
      obbligatoria: true,
      ordine: 1,
    };
    expect(campo.tipo).toBe('foto');
    expect(campo.obbligatoria).toBe(true);
  });

  it('obbligatoria è opzionale (campo foto facoltativo)', () => {
    const campo: TemplateCampo = {
      chiave: 'foto_panoramica',
      etichetta: 'Foto panoramica',
      tipo: 'foto',
      ordine: 2,
    };
    expect(campo.tipo).toBe('foto');
    expect(campo.obbligatoria).toBeUndefined();
  });
});
