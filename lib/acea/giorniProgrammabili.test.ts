import { describe, it, expect } from 'vitest';
import {
  eDataIso, eProgrammabile, giorniProgrammabili, giornoEsteso, prossimoFeriale, spiegaFinestra,
} from './giorniProgrammabili';

// Riferimenti fissi (2026): 27/07 lunedì … 31/07 venerdì, 01/08 sabato, 02/08 domenica, 03/08 lunedì.

describe('prossimoFeriale', () => {
  it('da lunedì a giovedì è il giorno dopo', () => {
    expect(prossimoFeriale('2026-07-27')).toBe('2026-07-28'); // lun → mar
    expect(prossimoFeriale('2026-07-30')).toBe('2026-07-31'); // gio → ven
  });

  it('da venerdì salta il weekend e arriva a lunedì', () => {
    expect(prossimoFeriale('2026-07-31')).toBe('2026-08-03');
  });

  it('da sabato e domenica è comunque lunedì', () => {
    expect(prossimoFeriale('2026-08-01')).toBe('2026-08-03');
    expect(prossimoFeriale('2026-08-02')).toBe('2026-08-03');
  });
});

describe('giorniProgrammabili', () => {
  it('sono sempre due: oggi e il prossimo feriale', () => {
    const g = giorniProgrammabili('2026-07-30');
    expect(g.map((x) => x.data)).toEqual(['2026-07-30', '2026-07-31']);
    expect(g.map((x) => x.etichetta)).toEqual(['Oggi', 'Domani']);
  });

  it('di venerdì il secondo giorno è lunedì, e NON si chiama «Domani»', () => {
    const g = giorniProgrammabili('2026-07-31');
    expect(g.map((x) => x.data)).toEqual(['2026-07-31', '2026-08-03']);
    // Il punto della regola: chiamarlo «Domani» farebbe assegnare al sabato credendo di
    // assegnare al lunedì.
    expect(g[1].etichetta).toBe('Lunedì');
    expect(g[1].esteso).toBe('lunedì 03/08');
  });

  it('nel weekend «oggi» resta programmabile e il secondo giorno è lunedì', () => {
    expect(giorniProgrammabili('2026-08-01').map((x) => x.data))
      .toEqual(['2026-08-01', '2026-08-03']);
    expect(giorniProgrammabili('2026-08-02').map((x) => x.data))
      .toEqual(['2026-08-02', '2026-08-03']);
  });

  it('«oggi» non valido non produce nessuna finestra invece di produrne una sbagliata', () => {
    expect(giorniProgrammabili('')).toEqual([]);
    expect(giorniProgrammabili('30/07/2026')).toEqual([]);
    expect(giorniProgrammabili('2026-02-31')).toEqual([]);
  });
});

describe('eProgrammabile', () => {
  it('accetta i due giorni della finestra e rifiuta tutto il resto', () => {
    expect(eProgrammabile('2026-07-31', '2026-07-31')).toBe(true);
    expect(eProgrammabile('2026-08-03', '2026-07-31')).toBe(true);
    // Il sabato in mezzo NON è programmabile pur essendo "domani".
    expect(eProgrammabile('2026-08-01', '2026-07-31')).toBe(false);
    expect(eProgrammabile('2026-07-30', '2026-07-31')).toBe(false); // ieri
    expect(eProgrammabile('2026-09-15', '2026-07-31')).toBe(false);
  });
});

describe('etichette', () => {
  it('giornoEsteso scrive giorno e data all’italiana', () => {
    expect(giornoEsteso('2026-07-30')).toBe('giovedì 30/07');
    expect(giornoEsteso('2026-08-02')).toBe('domenica 02/08');
  });

  it('giornoEsteso restituisce l’input quando non è una data', () => {
    expect(giornoEsteso('boh')).toBe('boh');
  });

  it('spiegaFinestra nomina entrambi i giorni', () => {
    expect(spiegaFinestra('2026-07-31'))
      .toBe('si programma solo per venerdì 31/07 o lunedì 03/08');
  });
});

describe('eDataIso', () => {
  it('rifiuta le date che non esistono', () => {
    expect(eDataIso('2026-07-30')).toBe(true);
    expect(eDataIso('2026-02-30')).toBe(false);
    expect(eDataIso('2026-13-01')).toBe(false);
    expect(eDataIso('30/07/2026')).toBe(false);
  });
});
