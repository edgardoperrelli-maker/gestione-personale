import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guardia sulla SCALA TIPOGRAFICA (DESIGN.md §4).
//
// La scala è quella delle utility Tailwind — text-xs 12 · text-sm 14 · text-base 16 ·
// text-lg 18 · text-xl 20 · text-2xl 24 — con SOLO DUE gradini intermedi ammessi in
// pixel arbitrari: 11 e 13. Tutto il resto è fuori scala.
//
// Nasce da una bonifica reale: 89 occorrenze di `text-[10px]` e 31 di `text-[9px]`
// (una dimensione che il sistema non ha mai avuto, illeggibile su schermo denso), più
// 4 dimensioni display sparse — 15, 17, 26 — a un passo da un gradino sanzionato.
// Il 23/07 erano già stati eliminati 37 mezzi pixel: senza una guardia, la scala si
// sporca di nuovo un componente alla volta.

const RADICI = ['app', 'components'];
const AMMESSE = new Set([11, 13]);

function file(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) file(p, out);
    else if (/\.tsx?$/.test(nome)) out.push(p);
  }
  return out;
}

/** Ogni `text-[<n>px]` del codebase, con posizione. */
function dimensioniArbitrarie(): { file: string; riga: number; valore: string }[] {
  const fuori: { file: string; riga: number; valore: string }[] = [];
  for (const radice of RADICI) {
    for (const f of file(resolve(__dirname, '../..', radice))) {
      readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
        for (const m of linea.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
          fuori.push({ file: f.split('/gestione-personale/')[1] ?? f, riga: i + 1, valore: m[1] });
        }
      });
    }
  }
  return fuori;
}

describe('scala tipografica (DESIGN.md §4)', () => {
  const trovate = dimensioniArbitrarie();

  it('nessun mezzo pixel', () => {
    const mezzi = trovate.filter((t) => t.valore.includes('.'));
    expect(
      mezzi.map((m) => `${m.file}:${m.riga} → ${m.valore}px`),
      'i mezzi pixel sono vietati: si usa il pixel intero',
    ).toEqual([]);
  });

  it('gli unici gradini in pixel arbitrari sono 11 e 13', () => {
    const fuoriScala = trovate.filter((t) => !AMMESSE.has(Number(t.valore)));
    expect(
      fuoriScala.map((m) => `${m.file}:${m.riga} → ${m.valore}px`),
      'fuori scala: usa le utility (text-xs 12 · text-sm 14 · text-base 16 · text-lg 18 · text-xl 20 · text-2xl 24) o i gradini 11/13',
    ).toEqual([]);
  });

  it('la guardia sta davvero leggendo il codebase', () => {
    // Se il crawler si rompesse (radice sbagliata, filtro troppo stretto) i due test
    // sopra passerebbero a vuoto: questo li tiene onesti.
    expect(trovate.length).toBeGreaterThan(100);
  });
});
