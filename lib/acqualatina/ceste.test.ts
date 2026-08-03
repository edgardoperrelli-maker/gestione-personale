import { describe, expect, it } from 'vitest';
import {
  numeriCesta,
  normalizzaConfig,
  partizionaDaScaricare,
  validaCesta,
  type ConfigCeste,
} from './ceste';

const riga = (id: string, data_esecuzione: string, matricola = id) => ({
  id, data_esecuzione, matricola,
});

describe('partizionaDaScaricare', () => {
  it('separa i misuratori del giorno dagli arretrati', () => {
    const { oggi, arretrati } = partizionaDaScaricare(
      [riga('a', '2026-08-03'), riga('b', '2026-08-01'), riga('c', '2026-08-03')],
      '2026-08-03',
    );
    expect(oggi.map((r) => r.id)).toEqual(['a', 'c']);
    expect(arretrati.map((r) => r.id)).toEqual(['b']);
  });

  it('non perde nessuna riga: le due liste coprono sempre l\'ingresso', () => {
    // Una data FUTURA non dovrebbe esistere, ma se esiste deve comparire da qualche parte:
    // una riga che sparisce dalla modale è un contatore che nessuno scarica mai.
    const righe = [riga('a', '2026-08-04'), riga('b', '2026-08-03'), riga('c', '2026-07-30')];
    const { oggi, arretrati } = partizionaDaScaricare(righe, '2026-08-03');
    expect([...oggi, ...arretrati]).toHaveLength(righe.length);
    expect(oggi.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('ordina gli arretrati dal più recente: «di ieri» viene prima di «della settimana scorsa»', () => {
    const { arretrati } = partizionaDaScaricare(
      [riga('vecchio', '2026-07-20'), riga('ieri', '2026-08-02'), riga('mezzo', '2026-07-31')],
      '2026-08-03',
    );
    expect(arretrati.map((r) => r.id)).toEqual(['ieri', 'mezzo', 'vecchio']);
  });

  it('a parità di data ordina per matricola (elenco stabile fra due aperture)', () => {
    const { oggi } = partizionaDaScaricare(
      [riga('x', '2026-08-03', '900'), riga('y', '2026-08-03', '100')],
      '2026-08-03',
    );
    expect(oggi.map((r) => r.matricola)).toEqual(['100', '900']);
  });

  it('lista vuota resta vuota', () => {
    expect(partizionaDaScaricare([], '2026-08-03')).toEqual({ oggi: [], arretrati: [] });
  });
});

describe('numeriCesta', () => {
  it('con l\'intervallo configurato elenca i numeri, estremi compresi', () => {
    expect(numeriCesta({ numeroMin: 3, numeroMax: 6 })).toEqual(['3', '4', '5', '6']);
  });

  it('un intervallo di una sola cesta è comunque un elenco', () => {
    expect(numeriCesta({ numeroMin: 7, numeroMax: 7 })).toEqual(['7']);
  });

  it('senza configurazione non c\'è elenco: il campo resta libero', () => {
    expect(numeriCesta({ numeroMin: null, numeroMax: null })).toEqual([]);
  });

  it('un intervallo assurdo non genera un menu di diecimila voci', () => {
    // Un refuso in configurazione («da 1 a 100000») non deve diventare una tendina
    // impraticabile sul telefono: si ricade sul campo libero.
    expect(numeriCesta({ numeroMin: 1, numeroMax: 100000 })).toEqual([]);
  });
});

describe('validaCesta', () => {
  const conf: ConfigCeste = { numeroMin: 1, numeroMax: 10 };

  it('un numero dentro l\'intervallo passa senza avvisi', () => {
    expect(validaCesta('4', conf)).toEqual({ ok: true, fuoriIntervallo: false });
  });

  it('vuoto non è una cesta', () => {
    expect(validaCesta('   ', conf).ok).toBe(false);
  });

  it('fuori intervallo AVVISA ma non blocca: il magazzino vince sulla configurazione', () => {
    // Aggiungono la cesta 11 prima che l'ufficio aggiorni l'intervallo: l'operatore deve poter
    // dire la verità.
    expect(validaCesta('11', conf)).toEqual({ ok: true, fuoriIntervallo: true });
  });

  it('un riferimento non numerico con l\'intervallo attivo è segnalato, non rifiutato', () => {
    expect(validaCesta('A1', conf)).toEqual({ ok: true, fuoriIntervallo: true });
  });

  it('senza configurazione qualunque riferimento va bene', () => {
    const libera: ConfigCeste = { numeroMin: null, numeroMax: null };
    expect(validaCesta('A1', libera)).toEqual({ ok: true, fuoriIntervallo: false });
    expect(validaCesta('999', libera)).toEqual({ ok: true, fuoriIntervallo: false });
  });
});

describe('normalizzaConfig', () => {
  it('legge la riga del DB', () => {
    expect(normalizzaConfig({ numero_min: 1, numero_max: 12 })).toEqual({ numeroMin: 1, numeroMax: 12 });
  });

  it('riga assente = non configurato', () => {
    expect(normalizzaConfig(null)).toEqual({ numeroMin: null, numeroMax: null });
  });

  it('un solo estremo non descrive niente: vale come non configurato', () => {
    expect(normalizzaConfig({ numero_min: 1, numero_max: null })).toEqual({ numeroMin: null, numeroMax: null });
  });

  it('intervallo rovesciato scartato (il CHECK del DB lo vieta, la lettura non si fida)', () => {
    expect(normalizzaConfig({ numero_min: 9, numero_max: 2 })).toEqual({ numeroMin: null, numeroMax: null });
  });

  it('accetta le stringhe numeriche che PostgREST può restituire', () => {
    expect(normalizzaConfig({ numero_min: '2', numero_max: '8' })).toEqual({ numeroMin: 2, numeroMax: 8 });
  });

  it('scarta i valori non interi invece di propagare NaN', () => {
    expect(normalizzaConfig({ numero_min: 'x', numero_max: 8 })).toEqual({ numeroMin: null, numeroMax: null });
    expect(normalizzaConfig({ numero_min: 1.5, numero_max: 8 })).toEqual({ numeroMin: null, numeroMax: null });
  });

  it('rifiuta lo zero e i negativi: le ceste si contano da 1', () => {
    expect(normalizzaConfig({ numero_min: 0, numero_max: 8 })).toEqual({ numeroMin: null, numeroMax: null });
  });
});
