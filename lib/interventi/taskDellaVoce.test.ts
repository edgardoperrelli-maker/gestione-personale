import { describe, expect, it } from 'vitest';
import { taskDellaVoce } from './taskDellaVoce';
import type { Task } from '@/utils/routing/types';

const t = (over: Partial<Task> & { id: string }): Task => ({ odl: null, ...over } as Task);

describe('taskDellaVoce', () => {
  it('trova il task per task_id, che nel piano-operatore e` univoco', () => {
    const tasks = [t({ id: 'row-3', odl: 'A' }), t({ id: 'row-5', odl: 'B' })];
    expect(taskDellaVoce(tasks, { task_id: 'row-5', odl: 'B' })?.id).toBe('row-5');
  });

  it('il task_id vince sull’ODL', () => {
    const tasks = [t({ id: 'row-3', odl: 'A' }), t({ id: 'row-5', odl: 'A' })];
    expect(taskDellaVoce(tasks, { task_id: 'row-3', odl: 'A' })?.id).toBe('row-3');
  });

  it('ripiega sull’ODL quando il task_id non combacia piu`', () => {
    const tasks = [t({ id: 'row-9', odl: '20043852265' })];
    expect(taskDellaVoce(tasks, { task_id: 'row-5', odl: '20043852265' })?.id).toBe('row-9');
    expect(taskDellaVoce(tasks, { task_id: null, odl: '20043852265' })?.id).toBe('row-9');
  });

  it('normalizza spazi e maiuscole dell’ODL', () => {
    const tasks = [t({ id: 'row-1', odl: ' 20043852265 ' })];
    expect(taskDellaVoce(tasks, { task_id: null, odl: '20043852265' })?.id).toBe('row-1');
  });

  /*
    Due task con lo STESSO ODL nello stesso giro sono due misuratori diversi: sceglierne uno a
    caso scriverebbe l'esito sul contatore sbagliato. Meglio nessuna ricostruzione.
  */
  it('con due task sullo stesso ODL non sceglie', () => {
    const tasks = [t({ id: 'row-1', odl: 'A' }), t({ id: 'row-2', odl: 'A' })];
    expect(taskDellaVoce(tasks, { task_id: null, odl: 'A' })).toBeNull();
  });

  it('senza chiavi utili non ricostruisce niente', () => {
    expect(taskDellaVoce([t({ id: 'row-1', odl: 'A' })], { task_id: null, odl: null })).toBeNull();
    expect(taskDellaVoce([], { task_id: 'row-1', odl: 'A' })).toBeNull();
    expect(taskDellaVoce([t({ id: 'row-1', odl: 'A' })], { task_id: 'row-9', odl: 'Z' })).toBeNull();
  });
});
