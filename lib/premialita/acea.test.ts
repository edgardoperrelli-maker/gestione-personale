import { describe, it, expect } from 'vitest';
import {
  efficienza,
  rispettaSoglia,
  premioAccessiAVuoto,
  variazionePrezzo,
  valutaKpi,
  SOGLIA_MINIMA,
  SOGLIA_PREMIO_ES,
} from './acea';

describe('efficienza', () => {
  it('calcola la percentuale arrotondata al primo decimale', () => {
    expect(efficienza(65, 100)).toBe(65);
    expect(efficienza(2, 3)).toBe(66.7);
  });
  it('ritorna 0 con denominatore nullo', () => {
    expect(efficienza(10, 0)).toBe(0);
  });
});

describe('rispettaSoglia (65%)', () => {
  it('true a 65 e oltre, false sotto', () => {
    expect(rispettaSoglia(SOGLIA_MINIMA)).toBe(true);
    expect(rispettaSoglia(64.9)).toBe(false);
    expect(rispettaSoglia(80)).toBe(true);
  });
});

describe('premioAccessiAVuoto (ES ≥ 80%)', () => {
  it('scatta solo da 80 in su', () => {
    expect(premioAccessiAVuoto(SOGLIA_PREMIO_ES)).toBe(true);
    expect(premioAccessiAVuoto(79.9)).toBe(false);
  });
});

describe('variazionePrezzo (-35% … +30%)', () => {
  const dichiarata = 75;
  it('al minimo (65%) vale -35%', () => {
    expect(variazionePrezzo(65, dichiarata)).toBe(-35);
  });
  it("all'efficienza dichiarata vale 0%", () => {
    expect(variazionePrezzo(dichiarata, dichiarata)).toBe(0);
  });
  it('a piena efficienza (85%+) vale +30% e resta cappata', () => {
    expect(variazionePrezzo(85, dichiarata)).toBe(30);
    expect(variazionePrezzo(100, dichiarata)).toBe(30);
  });
  it('interpola tra le soglie', () => {
    // a metà tra 65 e 75 → metà di -35 → -17.5
    expect(variazionePrezzo(70, dichiarata)).toBe(-17.5);
  });
});

describe('valutaKpi', () => {
  it('compone efficienza, soglia, banda prezzo e premio (ES)', () => {
    const res = valutaKpi({ code: 'ES', eseguitiPositivi: 82, assegnatiDovuti: 100, efficienzaDichiarata: 75 });
    expect(res.efficienza).toBe(82);
    expect(res.sogliaOk).toBe(true);
    expect(res.premio).toBe(true);
    expect(res.variazionePrezzo).toBeGreaterThan(0);
  });
  it('il premio è solo per ES, non per gli altri KPI', () => {
    const res = valutaKpi({ code: 'EL', eseguitiPositivi: 90, assegnatiDovuti: 100, efficienzaDichiarata: 70 });
    expect(res.premio).toBe(false);
  });
  it('segnala il mancato rispetto soglia sotto il 65%', () => {
    const res = valutaKpi({ code: 'ERC', eseguitiPositivi: 50, assegnatiDovuti: 100, efficienzaDichiarata: 70 });
    expect(res.sogliaOk).toBe(false);
  });
});
