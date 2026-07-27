import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLUG_TERRITORI, getTerritoryStyle } from './territoryColors';

// Guardia sui colori dei territori.
//
// Nasce da un difetto reale: ACEA, ACQUA LATINA, MAGAZZINO e MILANO non erano nella
// mappa e cadevano tutti sul `fallback`, quindi risultavano indistinguibili fra loro
// (ACEA da sola vale ~280 assegnazioni). Un territorio non mappato NON rompe niente —
// prende il grigio e tace — ed è proprio per questo che serve un test: il difetto è
// invisibile finché qualcuno non nota che due colonne hanno lo stesso colore.

const CSS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

const CAMPI = ['band', 'text', 'bg', 'bd'] as const;

/** Valore dichiarato per `--terr-<slug>-<campo>` in globals.css, o null se manca. */
function token(slug: string, campo: string): string | null {
  const m = CSS.match(new RegExp(`--terr-${slug}-${campo}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const SLUGS = [...new Set(Object.values(SLUG_TERRITORI))];

describe('token dei territori dichiarati in globals.css', () => {
  it.each([...SLUGS, 'fallback'])('«%s» ha tutti e quattro i campi', (slug) => {
    for (const campo of CAMPI) {
      expect(token(slug, campo), `manca --terr-${slug}-${campo}`).not.toBeNull();
    }
  });

  // Il senso del colore è distinguere: due territori con la stessa banda sono due
  // territori che a colpo d'occhio sono lo stesso territorio.
  it('nessun territorio mappato condivide la banda con un altro', () => {
    const perBanda = new Map<string, string[]>();
    for (const slug of SLUGS) {
      const banda = token(slug, 'band')!.toUpperCase();
      perBanda.set(banda, [...(perBanda.get(banda) ?? []), slug]);
    }
    const collisioni = [...perBanda.entries()].filter(([, s]) => s.length > 1);
    expect(collisioni, `bande condivise: ${JSON.stringify(collisioni)}`).toEqual([]);
  });
});

describe('getTerritoryStyle', () => {
  it.each(Object.entries(SLUG_TERRITORI))('«%s» → var del suo slug', (nome, slug) => {
    expect(getTerritoryStyle(nome)).toEqual({
      bg: `var(--terr-${slug}-bg)`,
      border: `var(--terr-${slug}-bd)`,
      text: `var(--terr-${slug}-text)`,
      band: `var(--terr-${slug}-band)`,
    });
  });

  it('normalizza spazi e maiuscole', () => {
    expect(getTerritoryStyle('  acqua latina ').band).toBe('var(--terr-acqualatina-band)');
    expect(getTerritoryStyle('AcEa').band).toBe('var(--terr-acea-band)');
  });

  it('nome sconosciuto, vuoto o assente → fallback', () => {
    for (const v of ['ROMA', '', '   ', null, undefined]) {
      expect(getTerritoryStyle(v).band).toBe('var(--terr-fallback-band)');
    }
  });
});
