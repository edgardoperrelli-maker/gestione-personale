import { describe, it, expect } from 'vitest';
import { matchEsecutore, buildEsecutorePins } from './esecutore';

const ops = [
  { id: 's1', displayName: 'PASTORELLI MARIO' },
  { id: 's2', displayName: 'DE SANTIS ALESSANDRO' },
  { id: 's3', displayName: 'ROSSI LUIGI' },
  { id: 's4', displayName: 'ROSSI ANNA' },
];

describe('matchEsecutore', () => {
  it('abbina per cognome singolo', () => {
    expect(matchEsecutore('PASTORELLI', ops)?.id).toBe('s1');
  });
  it('abbina cognome composto multi-token', () => {
    expect(matchEsecutore('DE SANTIS', ops)?.id).toBe('s2');
  });
  it('ignora maiuscole/minuscole e spazi extra', () => {
    expect(matchEsecutore('  pastorelli ', ops)?.id).toBe('s1');
  });
  it('ritorna null se non trovato', () => {
    expect(matchEsecutore('BIANCHI', ops)).toBeNull();
  });
  it('ritorna null se ambiguo (più match)', () => {
    expect(matchEsecutore('ROSSI', ops)).toBeNull();
  });
});

describe('buildEsecutorePins', () => {
  it('costruisce pin, operatori da selezionare e non abbinati', () => {
    const tasks = [
      { id: 't1', _operatore: 'PASTORELLI' },
      { id: 't2', _operatore: 'PASTORELLI' },
      { id: 't3', _operatore: 'DE SANTIS' },
      { id: 't4', _operatore: 'BIANCHI' },
      { id: 't5' },
    ];
    const res = buildEsecutorePins(tasks, ops);
    expect(res.pins).toEqual({ t1: 's1', t2: 's1', t3: 's2' });
    expect([...res.operatoriDaSelezionare].sort()).toEqual(['s1', 's2']);
    expect(res.nonAbbinati).toEqual(['BIANCHI']);
  });
  it('nessun esecutore → tutto vuoto', () => {
    const res = buildEsecutorePins([{ id: 't1' }], ops);
    expect(res.pins).toEqual({});
    expect(res.operatoriDaSelezionare).toEqual([]);
    expect(res.nonAbbinati).toEqual([]);
  });
});
