import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guardia di regressione sul CONTRASTO dei token di testo.
//
// Nasce da un difetto reale: `--brand-text-subtle` valeva oklch(0.62 …) e rendeva
// 3,64:1 su superficie bianca — sotto la soglia AA di 4,5:1 per il testo normale —
// su 116 usi non decorativi in tutto il codebase. Il colore "sembrava" a posto a
// occhio, ed è esattamente il tipo di difetto che solo una misura trova.
//
// La soglia è 4,5:1 (WCAG 2.1 AA, testo normale) e non 3:1: il "testo grande"
// esonerato parte da 24px, mentre i token qui sotto vestono testo da 10 a 16px.
// Le ICONE decorative (aria-hidden) non sono coperte: non veicolano informazione.

const CSS = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');

type Oklch = [number, number, number];

/**
 * Il blocco che dichiara la scala di testo, trovato per CONTENUTO e non per selettore:
 * `globals.css` apre `:root` più volte (brand, territori), quindi ancorarsi al selettore
 * pescherebbe il blocco sbagliato.
 *
 * Dal 2026-07-27 il tema è UNO solo (DESIGN.md §2): il blocco atteso è esattamente uno.
 * L'asserzione sul conteggio non è pedanteria — se qualcuno reintroducesse un secondo
 * blocco-tema, questo test lo direbbe subito invece di controllarne silenziosamente uno
 * a caso dei due.
 */
function bloccoTema(): Map<string, Oklch> {
  const trovati: Map<string, Oklch>[] = [];
  for (const m of CSS.matchAll(/^[^\s@][^{]*\{([\s\S]*?)^\}/gm)) {
    const token = new Map<string, Oklch>();
    for (const t of m[1].matchAll(/(--[\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
      token.set(t[1], [Number(t[2]), Number(t[3]), Number(t[4])]);
    }
    if (token.has('--brand-text-subtle') && token.has('--brand-surface')) trovati.push(token);
  }
  expect(trovati, 'atteso UN solo blocco-tema con la scala di testo (§2: tema unico)').toHaveLength(1);
  expect(trovati[0].get('--brand-surface')![0], 'il tema unico è quello chiaro').toBeGreaterThan(0.5);
  return trovati[0];
}

const TEMA = bloccoTema();

/** OKLCH → sRGB (0–1). Conversione standard via LMS. */
function oklchToSrgb([L, C, H]: Oklch): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

function luminanza(c: [number, number, number]): number {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrasto(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [luminanza(a), luminanza(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const AA_TESTO_NORMALE = 4.5;
const TESTO = ['--brand-text-main', '--brand-text-muted', '--brand-text-subtle'];
const SUPERFICI = ['--brand-bg', '--brand-surface', '--brand-surface-muted'];

describe('contrasto dei token di testo — tema unico', () => {
  const token = TEMA;

  it.each(TESTO)('%s passa AA su ogni superficie di modulo', (nomeTesto) => {
    const testo = token.get(nomeTesto);
    expect(testo, `${nomeTesto} non dichiarato`).toBeDefined();
    for (const nomeSup of SUPERFICI) {
      const sup = token.get(nomeSup);
      expect(sup, `${nomeSup} non dichiarato`).toBeDefined();
      const r = contrasto(oklchToSrgb(testo!), oklchToSrgb(sup!));
      expect(
        r,
        `${nomeTesto} su ${nomeSup} rende ${r.toFixed(2)}:1, sotto AA ${AA_TESTO_NORMALE}:1`,
      ).toBeGreaterThanOrEqual(AA_TESTO_NORMALE);
    }
  });

  it('la gerarchia del testo resta ordinata: main più forte di muted, muted di subtle', () => {
    const sup = oklchToSrgb(token.get('--brand-surface')!);
    const [main, muted, subtle] = TESTO.map((t) => contrasto(oklchToSrgb(token.get(t)!), sup));
    expect(main).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(subtle);
  });

  it('i tre livelli restano VISIBILMENTE distinti, non solo ordinati', () => {
    // L'ordine da solo non basta: dopo aver alzato `subtle` a norma i due livelli
    // bassi distavano ΔL 0.04 — ordinati ma indistinguibili, cioè due livelli
    // travestiti da tre. La distanza minima è 0.08 in L OKLCH (percettivamente
    // ~uniforme). Alzare un token a norma senza guardare il vicino è il modo
    // esatto in cui questa scala si è già schiacciata una volta.
    const L = TESTO.map((t) => token.get(t)![0]);
    for (let i = 1; i < L.length; i++) {
      // Arrotondato: 0.70 - 0.62 vale 0.07999999999999996 in virgola mobile e
      // fallirebbe una soglia secca su un valore che è esattamente 0.08.
      const delta = Math.round(Math.abs(L[i] - L[i - 1]) * 1000) / 1000;
      expect(
        delta,
        `${TESTO[i - 1]} e ${TESTO[i]} distano ΔL ${delta.toFixed(2)}: sotto 0.08 la gerarchia si schiaccia`,
      ).toBeGreaterThanOrEqual(0.08);
    }
  });
});
