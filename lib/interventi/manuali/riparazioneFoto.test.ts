import { describe, it, expect } from 'vitest';
import { slotDaRiparare } from './riparazioneFoto';

const righe = [
  { slot_chiave: 'vecchio', storage_path: 'req/vecchio_x.jpg' },
  { slot_chiave: 'nuovo', storage_path: 'req/nuovo_x.jpg' },
  { slot_chiave: 'minibag', storage_path: 'req/minibag_x.jpg' },
];

describe('slotDaRiparare', () => {
  it('nessuno se tutti i file sono presenti', () => {
    const presenti = new Set(righe.map((r) => r.storage_path));
    expect(slotDaRiparare(righe, [{ chiave: 'vecchio', file: 'F' }], presenti)).toEqual([]);
  });

  it('ripara solo gli slot col file mancante E con foto nel re-invio', () => {
    const presenti = new Set(['req/vecchio_x.jpg']); // nuovo e minibag mancano
    const ricevute = [{ chiave: 'nuovo', file: 'Fn' }]; // ho solo "nuovo"
    expect(slotDaRiparare(righe, ricevute, presenti)).toEqual([
      { chiave: 'nuovo', storagePath: 'req/nuovo_x.jpg', file: 'Fn' },
    ]);
  });

  it('non ripara se manca il file ma il re-invio non porta quella foto', () => {
    const presenti = new Set<string>(); // tutti mancanti
    expect(slotDaRiparare(righe, [], presenti)).toEqual([]);
  });

  it('ripara tutti gli slot mancanti se il re-invio li porta tutti', () => {
    const presenti = new Set<string>();
    const ricevute = [
      { chiave: 'vecchio', file: 'a' }, { chiave: 'nuovo', file: 'b' }, { chiave: 'minibag', file: 'c' },
    ];
    expect(slotDaRiparare(righe, ricevute, presenti).map((s) => s.chiave)).toEqual(['vecchio', 'nuovo', 'minibag']);
  });
});
