import { describe, it, expect } from 'vitest';
import {
  eDataIso, eProgrammabile, giorniProgrammabili, giornoEsteso, prossimoLavorativo,
  soloAttivazioni, spiegaFinestra,
} from './giorniProgrammabili';

// Riferimenti fissi (2026): 27/07 lunedì … 31/07 venerdì, 01/08 sabato, 02/08 domenica, 03/08 lunedì.

describe('prossimoLavorativo', () => {
  it('da lunedì a giovedì è il giorno dopo', () => {
    expect(prossimoLavorativo('2026-07-27')).toBe('2026-07-28'); // lun → mar
    expect(prossimoLavorativo('2026-07-30')).toBe('2026-07-31'); // gio → ven
  });

  it('il sabato è lavorativo: da venerdì si va a sabato, non a lunedì', () => {
    expect(prossimoLavorativo('2026-07-31')).toBe('2026-08-01');
  });

  it('solo la domenica non è lavorativa: da sabato e da domenica si arriva a lunedì', () => {
    expect(prossimoLavorativo('2026-08-01')).toBe('2026-08-03');
    expect(prossimoLavorativo('2026-08-02')).toBe('2026-08-03');
  });
});

describe('soloAttivazioni', () => {
  it('venerdì e sabato accettano solo riaperture', () => {
    expect(soloAttivazioni('2026-07-31')).toBe(true); // venerdì
    expect(soloAttivazioni('2026-08-01')).toBe(true); // sabato
  });

  it('dal lunedì al giovedì si programma tutto', () => {
    for (const d of ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30']) {
      expect(soloAttivazioni(d)).toBe(false);
    }
  });

  it('una data non valida non è un giorno di sole attivazioni', () => {
    expect(soloAttivazioni('boh')).toBe(false);
  });
});

describe('giorniProgrammabili', () => {
  it('sono sempre due: oggi e il prossimo lavorativo', () => {
    const g = giorniProgrammabili('2026-07-30');
    expect(g.map((x) => x.data)).toEqual(['2026-07-30', '2026-07-31']);
    expect(g.map((x) => x.etichetta)).toEqual(['Oggi', 'Domani']);
  });

  it('di giovedì il domani è venerdì, e il venerdì è marcato solo-attivazioni', () => {
    const g = giorniProgrammabili('2026-07-30');
    expect(g[0].soloAttivazioni).toBe(false);
    expect(g[1].soloAttivazioni).toBe(true);
  });

  it('di venerdì il secondo giorno è sabato, ed entrambi sono solo-attivazioni', () => {
    const g = giorniProgrammabili('2026-07-31');
    expect(g.map((x) => x.data)).toEqual(['2026-07-31', '2026-08-01']);
    expect(g[1].etichetta).toBe('Domani');
    expect(g.map((x) => x.soloAttivazioni)).toEqual([true, true]);
  });

  it('di sabato il secondo giorno è lunedì, e NON si chiama «Domani»', () => {
    const g = giorniProgrammabili('2026-08-01');
    expect(g.map((x) => x.data)).toEqual(['2026-08-01', '2026-08-03']);
    // Chiamarlo «Domani» farebbe assegnare alla domenica credendo di assegnare al lunedì.
    expect(g[1].etichetta).toBe('Lunedì');
    expect(g[1].esteso).toBe('lunedì 03/08');
    expect(g.map((x) => x.soloAttivazioni)).toEqual([true, false]);
  });

  it('di domenica «oggi» resta programmabile e il secondo giorno è lunedì', () => {
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
    expect(eProgrammabile('2026-08-01', '2026-07-31')).toBe(true);   // sabato, da venerdì
    expect(eProgrammabile('2026-08-03', '2026-07-31')).toBe(false);  // lunedì: troppo in là
    expect(eProgrammabile('2026-07-30', '2026-07-31')).toBe(false);  // ieri
    expect(eProgrammabile('2026-09-15', '2026-07-31')).toBe(false);
  });

  it('la domenica non è mai programmabile, se non come «oggi»', () => {
    expect(eProgrammabile('2026-08-02', '2026-08-01')).toBe(false);
    expect(eProgrammabile('2026-08-02', '2026-08-02')).toBe(true);
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
      .toBe('si programma solo per venerdì 31/07 o sabato 01/08');
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
