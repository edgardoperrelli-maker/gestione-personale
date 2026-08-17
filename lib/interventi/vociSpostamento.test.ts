import { describe, expect, it } from 'vitest';
import {
  avvisoVociConservate, voceVuota, vociDaSpostamento,
  type VoceDaSpostamento,
} from './vociSpostamento';

const PRATESI = '387eca6d-1932-4e9a-9dca-781ea12de2c0';
const LIBERATORI = '80b25f40-35a8-429e-b21c-0eb07c71683e';

const voce = (p: Partial<VoceDaSpostamento> = {}): VoceDaSpostamento => ({
  id: 'v1',
  rapportino_id: 'r1',
  staff_id: PRATESI,
  data: '2026-08-14',
  stato: 'in_corso',
  risposte: {},
  ...p,
});

describe('voceVuota', () => {
  it('e` vuota senza risposte', () => {
    expect(voceVuota(null)).toBe(true);
    expect(voceVuota(undefined)).toBe(true);
    expect(voceVuota({})).toBe(true);
  });

  it('le chiavi presenti ma senza valore non sono lavoro svolto', () => {
    expect(voceVuota({ eseguito: '', note: '   ', foto: [], extra: {} })).toBe(true);
    expect(voceVuota({ eseguito: null, sigillo: undefined })).toBe(true);
  });

  it('una risposta valorizzata la rende compilata', () => {
    expect(voceVuota({ eseguito: 'SI' })).toBe(false);
    expect(voceVuota({ eseguito: '', note: 'utente assente' })).toBe(false);
    expect(voceVuota({ foto: ['rapportini/a.jpg'] })).toBe(false);
    expect(voceVuota({ letture: 0 })).toBe(false);
  });
});

describe('vociDaSpostamento', () => {
  const dest = { staffId: LIBERATORI, data: '2026-08-14' };

  it('la voce gia` sulla destinazione non si tocca', () => {
    const v = voce({ staff_id: LIBERATORI });
    expect(vociDaSpostamento([v], dest)).toEqual({ daRimuovere: [], daConservare: [] });
  });

  it('la voce vuota del vecchio esecutore si rimuove', () => {
    expect(vociDaSpostamento([voce()], dest).daRimuovere).toEqual(['v1']);
  });

  it('vale anche per il cambio di solo GIORNO, a parita` di operatore', () => {
    const v = voce({ staff_id: LIBERATORI, data: '2026-08-13' });
    expect(vociDaSpostamento([v], dest).daRimuovere).toEqual(['v1']);
  });

  it('la voce gia` compilata resta e si segnala', () => {
    const v = voce({ risposte: { eseguito: 'NO' } });
    const esito = vociDaSpostamento([v], dest);
    expect(esito.daRimuovere).toEqual([]);
    expect(esito.daConservare).toEqual([{ voce: v, motivo: 'compilata' }]);
  });

  it('la voce vuota su un rapportino gia` inviato resta e si segnala', () => {
    const v = voce({ stato: 'inviato' });
    const esito = vociDaSpostamento([v], dest);
    expect(esito.daRimuovere).toEqual([]);
    expect(esito.daConservare).toEqual([{ voce: v, motivo: 'rapportino_inviato' }]);
  });

  it('«compilata» vince su «inviato»: e` la ragione piu` forte per conservare', () => {
    const v = voce({ stato: 'inviato', risposte: { eseguito: 'SI' } });
    expect(vociDaSpostamento([v], dest).daConservare[0].motivo).toBe('compilata');
  });

  /*
    Il caso 12384609 del 14/08/2026: la pianificazione sposta l'intervento da PRATESI a
    LIBERATORI alle 10:42, quando il rapportino di PRATESI e` ancora in corso e la sua voce
    ancora vuota. Prima di questa regola restavano due voci, i due operatori esitavano lo
    stesso intervento e vinceva l'ultimo che inviava.
  */
  it('12384609: la voce vuota di PRATESI se ne va, quella di LIBERATORI resta', () => {
    const pratesi = voce({ id: 'voce-pratesi' });
    const liberatori = voce({ id: 'voce-liberatori', rapportino_id: 'r2', staff_id: LIBERATORI });
    const esito = vociDaSpostamento([pratesi, liberatori], dest);
    expect(esito.daRimuovere).toEqual(['voce-pratesi']);
    expect(esito.daConservare).toEqual([]);
  });

  it('e` idempotente: senza residui non decide niente', () => {
    const v = voce({ staff_id: LIBERATORI });
    expect(vociDaSpostamento([v], dest)).toEqual({ daRimuovere: [], daConservare: [] });
    expect(vociDaSpostamento([], dest)).toEqual({ daRimuovere: [], daConservare: [] });
  });
});

describe('avvisoVociConservate', () => {
  it('niente da conservare, niente da dire', () => {
    expect(avvisoVociConservate([])).toBeNull();
  });

  it('nomina il motivo al singolare', () => {
    const a = avvisoVociConservate([{ voce: voce(), motivo: 'compilata' }]);
    expect(a).toContain('Una voce di rapportino resta');
    expect(a).toContain('1 già compilata dal precedente esecutore');
  });

  it('conta i due motivi separatamente', () => {
    const a = avvisoVociConservate([
      { voce: voce({ id: 'a' }), motivo: 'compilata' },
      { voce: voce({ id: 'b' }), motivo: 'compilata' },
      { voce: voce({ id: 'c' }), motivo: 'rapportino_inviato' },
    ]);
    expect(a).toContain('3 voci di rapportino restano');
    expect(a).toContain('2 già compilate');
    expect(a).toContain('1 su un rapportino già inviato');
  });
});
