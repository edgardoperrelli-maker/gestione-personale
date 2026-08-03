import { describe, it, expect } from 'vitest';
import { decidiConFonteViva, esattiPerMatricola, unisciCensiti } from './ricercaMisuratore';
import type { CensitoMisuratore } from './autofillAnagrafica';

const m = (matricola: string, odl?: string, over: Partial<CensitoMisuratore> = {}): CensitoMisuratore =>
  ({ matricola, odl, ...over });

describe('esattiPerMatricola', () => {
  it('confronta normalizzando: trattini, spazi e minuscole non contano', () => {
    const righe = [m('202015211018', '912492867'), m('202015211019', '912492756')];
    expect(esattiPerMatricola('2020-1521 1018', righe).map((r) => r.odl)).toEqual(['912492867']);
  });
  it('matricola vuota → nessun esatto (o matcherebbe le righe senza matricola)', () => {
    expect(esattiPerMatricola('', [m(''), m('X')])).toEqual([]);
  });
});

describe('unisciCensiti', () => {
  it('a parità di ODL vince chi arriva prima', () => {
    const viva = m('202015211018', '912492867', { cap: '00060' });
    const vecchia = m('202015211018', '912492867', { cap: '60' });
    expect(unisciCensiti([viva], [vecchia])).toEqual([viva]);
  });
  it('ODL diversi restano righe diverse', () => {
    expect(unisciCensiti([m('A', '1')], [m('A', '2')])).toHaveLength(2);
  });
  it('senza ODL l’identità è la matricola', () => {
    expect(unisciCensiti([m('A-1')], [m('a1')])).toHaveLength(1);
  });
});

describe('decidiConFonteViva', () => {
  const viva = [m('202015211018', '912492867')];

  it('l’esatto del registro compila, e porta il SUO ODL', () => {
    const r = decidiConFonteViva('202015211018', viva, []);
    expect(r).toEqual({ trovato: true, misuratore: viva[0] });
  });

  /*
    La regressione che questa regola esiste per evitare: 59 matricole hanno un ordine ancora aperto
    nel registro con un ODL DIVERSO da quello del master congelato. Unendo le due fonti sarebbero
    due «esatti» — un'ambiguità inventata da noi, su misuratori che oggi si trovano al primo colpo.
  */
  it('quando il registro ha l’esatto, il master congelato non entra in ballottaggio', () => {
    const congelata = [m('202015211018', '912214973')];   // stesso contatore, ODL vecchio
    const r = decidiConFonteViva('202015211018', viva, congelata);
    expect(r).toEqual({ trovato: true, misuratore: viva[0] });
  });

  it('dove il registro non arriva, decide il master (ZAGAROLO e LABICO)', () => {
    const congelata = [m('202115406275', '912214973')];
    const r = decidiConFonteViva('202115406275', [], congelata);
    expect(r).toEqual({ trovato: true, misuratore: congelata[0] });
  });

  // I tronconi condivisi: stessa matricola nel registro su più ordini aperti. Sceglie l'operatore,
  // che l'indirizzo ce l'ha davanti — noi sceglieremmo un ODL a caso su un lavoro fatto.
  it('più esatti nel registro → ambiguo, e i candidati si mostrano', () => {
    const tronconi = [m('SETA07122500517', '912490311'), m('SETA07122500517', '912489803')];
    const r = decidiConFonteViva('SETA07122500517', tronconi, []);
    expect(r.trovato).toBe(false);
    if (!r.trovato) {
      expect(r.ambigui).toBe(true);
      expect(r.suggerimenti).toHaveLength(2);
    }
  });

  // Il caso RIANO al contrario: l'operatore legge 16 cifre, il registro ne ha 15. Non è un esatto,
  // ma `matricoleSimili` riconosce il troncone e lo propone col suo indirizzo.
  it('nessun esatto → i simili, tronconi del registro compresi', () => {
    const tronconi = [m('SETA07122500517', '912490311')];
    const r = decidiConFonteViva('SETA071225005173', tronconi, []);
    expect(r.trovato).toBe(false);
    if (!r.trovato) {
      expect(r.ambigui).toBe(false);
      expect(r.suggerimenti.map((s) => s.odl)).toEqual(['912490311']);
    }
  });
});
