import { describe, it, expect } from 'vitest';
import type { TemplateCampo } from './buildVoci';
import { slotFotoCondizionali, fotoSlotObbligatorio } from './fotoCondizionali';

// Specchio del template "Rapportino limitazioni massive".
const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'], ordine: 1 },
  { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 2 },
  { chiave: 'ante_panoramica', etichetta: 'Ante Panoramica', tipo: 'foto', obbligatoria: true, ordine: 6 },
  { chiave: 'sost_valvola', etichetta: 'Sost. Valvola', tipo: 'foto', ordine: 10 },
];

describe('slotFotoCondizionali', () => {
  it('valvola = SI → la foto valvola diventa obbligatoria', () => {
    const set = slotFotoCondizionali(campi, { sostituzione_valvola: 'SI' });
    expect(set.has('sost_valvola')).toBe(true);
  });

  it('valvola = NO → nessuna foto condizionale', () => {
    expect(slotFotoCondizionali(campi, { sostituzione_valvola: 'NO' }).size).toBe(0);
  });

  it('valvola non compilata → nessuna foto condizionale', () => {
    expect(slotFotoCondizionali(campi, {}).size).toBe(0);
  });

  it('accetta varianti di "SI" (minuscolo, accentato)', () => {
    expect(slotFotoCondizionali(campi, { sostituzione_valvola: 'si' }).has('sost_valvola')).toBe(true);
    expect(slotFotoCondizionali(campi, { sostituzione_valvola: ' Sì ' }).has('sost_valvola')).toBe(true);
  });

  it('non tocca le foto non-valvola', () => {
    const set = slotFotoCondizionali(campi, { sostituzione_valvola: 'SI' });
    expect(set.has('ante_panoramica')).toBe(false);
  });

  it('template senza foto valvola → nessun effetto anche con trigger attivo', () => {
    const senzaFotoValvola = campi.filter((c) => c.chiave !== 'sost_valvola');
    expect(slotFotoCondizionali(senzaFotoValvola, { sostituzione_valvola: 'SI' }).size).toBe(0);
  });

  it('trigger a crocetta: spuntata attiva l\'obbligo', () => {
    const campiCrocetta: TemplateCampo[] = [
      { chiave: 'sost_valvola_fatta', etichetta: 'Sostituzione valvola', tipo: 'crocetta', ordine: 1 },
      { chiave: 'foto_valvola', etichetta: 'Foto valvola', tipo: 'foto', ordine: 2 },
    ];
    expect(slotFotoCondizionali(campiCrocetta, { sost_valvola_fatta: true }).has('foto_valvola')).toBe(true);
    expect(slotFotoCondizionali(campiCrocetta, { sost_valvola_fatta: false }).size).toBe(0);
  });
});

describe('fotoSlotObbligatorio', () => {
  const cond = new Set<string>(['sost_valvola']);
  it('obbligatoria statica → true', () => {
    expect(fotoSlotObbligatorio(campi[2], cond)).toBe(true); // ante_panoramica obbligatoria
  });
  it('resa obbligatoria da condizione → true', () => {
    expect(fotoSlotObbligatorio(campi[3], cond)).toBe(true); // sost_valvola nel set
  });
  it('non obbligatoria e non condizionata → false', () => {
    expect(fotoSlotObbligatorio(campi[3], new Set())).toBe(false);
  });
});
