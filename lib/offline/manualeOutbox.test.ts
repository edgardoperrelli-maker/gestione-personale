import { describe, it, expect } from 'vitest';
import { costruisciManualeOutbox } from './manualeOutbox';
import type { PayloadManuale } from './types';

const payload: PayloadManuale = {
  richiestaId: 'r-1',
  committente: 'acea',
  anagrafica: { nominativo: 'Rossi' },
  risposte: { esito: 'ok' },
  note: null,
  fotoBlobRefs: [{ chiave: 'foto1', blobId: 'bl-1' }],
};

describe('costruisciManualeOutbox', () => {
  it('crea un item manuale con id idempotente e payload completo', () => {
    const item = costruisciManualeOutbox('tok', payload, 1234);
    expect(item.id).toBe('manuale:tok:r-1');
    expect(item.type).toBe('manuale');
    expect(item.token).toBe('tok');
    expect(item.createdAt).toBe(1234);
    expect(item.tentativi).toBe(0);
    expect(item.stato).toBe('in_attesa');
    expect(item.payload).toEqual(payload);
  });
});
