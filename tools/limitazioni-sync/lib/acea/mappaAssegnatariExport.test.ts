import { describe, it, expect } from 'vitest';
import { costruisciMappaAssegnatari, preassegnatoGiusto } from './mappaAssegnatariExport.mjs';

describe('costruisciMappaAssegnatari', () => {
  it('mappa odl→operatore normalizzando l ODL e scartando righe senza operatore', () => {
    const m = costruisciMappaAssegnatari([
      { ordine: ' 957364267 ', operatore: 'SIKORA FRANCO' },
      { ordine: '957362111', operatore: 'DIONISI' },
      { ordine: '957999999', operatore: '' }, // senza operatore → scartata
      { ordine: '', operatore: 'ROSSI' }, // senza odl → scartata
    ]);
    expect(m.get('957364267')).toBe('SIKORA FRANCO');
    expect(m.get('957362111')).toBe('DIONISI');
    expect(m.has('957999999')).toBe(false);
    expect(m.size).toBe(2);
  });

  it('a parità di ODL tiene il primo (stabile)', () => {
    const m = costruisciMappaAssegnatari([
      { ordine: '111', operatore: 'PRIMO' },
      { ordine: '111', operatore: 'SECONDO' },
    ]);
    expect(m.get('111')).toBe('PRIMO');
  });

  it('input vuoto/nullo → mappa vuota', () => {
    expect(costruisciMappaAssegnatari(undefined).size).toBe(0);
    expect(costruisciMappaAssegnatari([]).size).toBe(0);
  });
});

describe('preassegnatoGiusto', () => {
  const m = costruisciMappaAssegnatari([
    { ordine: '957364267', operatore: 'SIKORA FRANCO' },
    { ordine: '957362111', operatore: 'DIONISI' },
  ]);

  it('vero se già assegnato alla risorsa giusta (confronto per cognome)', () => {
    expect(preassegnatoGiusto('957364267', 'SIKORA', m, {})).toBe(true);
    // anche se la grafia voluta porta il nome completo
    expect(preassegnatoGiusto('957364267', 'SIKORA FRANCO', m, {})).toBe(true);
  });

  it('falso se assegnato a risorsa diversa', () => {
    expect(preassegnatoGiusto('957364267', 'DIONISI', m, {})).toBe(false);
  });

  it('falso se ODL non presente nell export (non assegnato)', () => {
    expect(preassegnatoGiusto('111111111', 'SIKORA', m, {})).toBe(false);
  });

  it('applica la mappatura acea.operatori su entrambi i lati', () => {
    // l app chiede "ROSSI Mario" → grafia ACEA "ROSSI MARIO"; export ha "ROSSI MARIO"
    const m2 = costruisciMappaAssegnatari([{ ordine: '222', operatore: 'ROSSI MARIO' }]);
    expect(preassegnatoGiusto('222', 'ROSSI Mario', m2, { 'ROSSI Mario': 'ROSSI MARIO' })).toBe(true);
  });

  it('mappa nulla → falso (degradazione morbida)', () => {
    expect(preassegnatoGiusto('957364267', 'SIKORA', null, {})).toBe(false);
  });
});
