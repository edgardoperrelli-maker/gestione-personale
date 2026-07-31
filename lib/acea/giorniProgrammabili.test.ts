import { describe, it, expect } from 'vitest';
import {
  descriviGiorno, eDataIso, eProgrammabile, etichettaGiorno, giorniRapidi, giornoEsteso,
  limitiFinestra, ORIZZONTE_GIORNI, prossimoLavorativo, soloAttivazioni, spiegaFinestra,
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

describe('giorniRapidi', () => {
  it('sono due: oggi e il prossimo lavorativo', () => {
    const g = giorniRapidi('2026-07-30');
    expect(g.map((x) => x.data)).toEqual(['2026-07-30', '2026-07-31']);
    expect(g.map((x) => x.etichetta)).toEqual(['Oggi', 'Domani']);
  });

  it('di giovedì il domani è venerdì, e il venerdì è marcato solo-attivazioni', () => {
    const g = giorniRapidi('2026-07-30');
    expect(g[0].soloAttivazioni).toBe(false);
    expect(g[1].soloAttivazioni).toBe(true);
  });

  it('di venerdì il secondo giorno è sabato, ed entrambi sono solo-attivazioni', () => {
    const g = giorniRapidi('2026-07-31');
    expect(g.map((x) => x.data)).toEqual(['2026-07-31', '2026-08-01']);
    expect(g[1].etichetta).toBe('Domani');
    expect(g.map((x) => x.soloAttivazioni)).toEqual([true, true]);
  });

  it('di sabato il secondo giorno è lunedì, e NON si chiama «Domani»', () => {
    const g = giorniRapidi('2026-08-01');
    expect(g.map((x) => x.data)).toEqual(['2026-08-01', '2026-08-03']);
    // Chiamarlo «Domani» farebbe assegnare alla domenica credendo di assegnare al lunedì.
    expect(g[1].etichetta).toBe('Lunedì');
    expect(g[1].esteso).toBe('lunedì 03/08');
    expect(g.map((x) => x.soloAttivazioni)).toEqual([true, false]);
  });

  it('di domenica «oggi» resta in elenco e il secondo giorno è lunedì', () => {
    expect(giorniRapidi('2026-08-02').map((x) => x.data)).toEqual(['2026-08-02', '2026-08-03']);
  });

  it('«oggi» non valido non produce nessun giorno invece di produrne uno sbagliato', () => {
    expect(giorniRapidi('')).toEqual([]);
    expect(giorniRapidi('30/07/2026')).toEqual([]);
    expect(giorniRapidi('2026-02-31')).toEqual([]);
  });
});

describe('etichettaGiorno e descriviGiorno', () => {
  it('oggi, domani, e il nome del giorno per tutti gli altri', () => {
    expect(etichettaGiorno('2026-07-31', '2026-07-31')).toBe('Oggi');
    expect(etichettaGiorno('2026-08-01', '2026-07-31')).toBe('Domani');
    expect(etichettaGiorno('2026-08-03', '2026-07-31')).toBe('Lunedì');
  });

  it('descriviGiorno porta con sé la regola del giorno', () => {
    expect(descriviGiorno('2026-08-03', '2026-07-31')).toEqual({
      data: '2026-08-03', etichetta: 'Lunedì', esteso: 'lunedì 03/08', soloAttivazioni: false,
    });
  });
});

describe('limitiFinestra', () => {
  it('da oggi a due settimane avanti', () => {
    expect(limitiFinestra('2026-07-31')).toEqual({ min: '2026-07-31', max: '2026-08-14' });
    expect(ORIZZONTE_GIORNI).toBe(14);
  });

  it('senza un «oggi» valido non inventa estremi', () => {
    expect(limitiFinestra('')).toBeNull();
    expect(limitiFinestra('2026-02-31')).toBeNull();
  });
});

describe('eProgrammabile', () => {
  it('IL LUNEDÌ SI PROGRAMMA, anche dal venerdì (dec. 49)', () => {
    // È il motivo della finestra larga: venerdì e sabato passano solo le attivazioni, e il lunedì
    // — primo giorno pieno del dunning — con la finestra di due giorni non si raggiungeva.
    expect(eProgrammabile('2026-08-03', '2026-07-31')).toBe(true);
  });

  it('accetta tutta la finestra e rifiuta quello che le sta fuori', () => {
    expect(eProgrammabile('2026-07-31', '2026-07-31')).toBe(true);   // oggi
    expect(eProgrammabile('2026-08-01', '2026-07-31')).toBe(true);   // sabato
    expect(eProgrammabile('2026-08-14', '2026-07-31')).toBe(true);   // l'ultimo giorno buono
    expect(eProgrammabile('2026-08-15', '2026-07-31')).toBe(false);  // uno oltre l'orizzonte
    expect(eProgrammabile('2026-07-30', '2026-07-31')).toBe(false);  // ieri: il passato non si programma
    expect(eProgrammabile('2026-09-15', '2026-07-31')).toBe(false);
  });

  it('la domenica non è mai programmabile, se non come «oggi»', () => {
    expect(eProgrammabile('2026-08-02', '2026-07-31')).toBe(false);
    expect(eProgrammabile('2026-08-09', '2026-07-31')).toBe(false);  // anche quella dopo
    expect(eProgrammabile('2026-08-02', '2026-08-02')).toBe(true);
  });

  it('senza un «oggi» valido non passa niente: meglio fermarsi che aprire tutto', () => {
    expect(eProgrammabile('2026-08-03', '')).toBe(false);
    expect(eProgrammabile('boh', '2026-07-31')).toBe(false);
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

  it('spiegaFinestra dice dove comincia e dove finisce la finestra', () => {
    expect(spiegaFinestra('2026-07-31'))
      .toBe('si programma da venerdì 31/07 a venerdì 14/08, domenica esclusa');
  });

  it('spiegaFinestra senza «oggi» resta una frase vera, senza date inventate', () => {
    expect(spiegaFinestra('')).toBe('si programma da oggi ai 14 giorni successivi, domenica esclusa');
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
