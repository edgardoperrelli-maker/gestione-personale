import { describe, it, expect } from 'vitest';
import { campoHaValore, colonneVisibili } from './colonneVisibili';
import type { TemplateInfoCampo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

const info: TemplateInfoCampo[] = [
  { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
  { chiave: 'pdr', etichetta: 'PDR', ordine: 2 },
  { chiave: 'via', etichetta: 'VIA', ordine: 3 },
];
const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

describe('campoHaValore', () => {
  it('crocetta: solo true conta come valorizzato', () => {
    expect(campoHaValore('crocetta', true)).toBe(true);
    expect(campoHaValore('crocetta', false)).toBe(false);
    expect(campoHaValore('crocetta', undefined)).toBe(false);
  });
  it('testo/numero: non vuoto conta come valorizzato', () => {
    expect(campoHaValore('testo', 'x')).toBe(true);
    expect(campoHaValore('testo', '  ')).toBe(false);
    expect(campoHaValore('numero', 0)).toBe(true);
    expect(campoHaValore('testo', null)).toBe(false);
  });
});

describe('colonneVisibili', () => {
  it('tiene solo info popolate e campi valorizzati in almeno una voce', () => {
    const voci = [
      { matricola: 'M1', pdr: '', via: 'VIA ROMA', risposte: { att_cess: false, note: 'ok' } },
      { matricola: '', pdr: '', via: 'VIA PO', risposte: { att_cess: false, note: '' } },
    ];
    const { info: i, campi: c } = colonneVisibili(info, campi, voci);
    expect(i.map((x) => x.chiave)).toEqual(['matricola', 'via']);
    expect(c.map((x) => x.chiave)).toEqual(['note']);
  });
  it('nessuna voce → nessuna colonna', () => {
    const { info: i, campi: c } = colonneVisibili(info, campi, []);
    expect(i).toEqual([]);
    expect(c).toEqual([]);
  });
  it('crocetta spuntata in almeno una voce → colonna visibile', () => {
    const voci = [{ risposte: { att_cess: true } }];
    const { campi: c } = colonneVisibili(info, campi, voci);
    expect(c.map((x) => x.chiave)).toEqual(['att_cess']);
  });
});
