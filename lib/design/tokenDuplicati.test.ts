import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guardia sui TOKEN DICHIARATI DUE VOLTE nello stesso blocco di globals.css.
//
// Nasce da un guasto vero, invisibile per sei giorni: il refactor che rimuoveva il tema scuro
// (`4a410046`, 27/07) ha concatenato la coda scura DENTRO lo stesso `:root` dei valori chiari.
// Stessa specificità, vince l'ultima dichiarazione: tutta l'app renderizzava `--status-*`,
// `--chart-*` e `--chip-overlay-*` con la taratura scura (status-warn a 1,9:1 su bianco),
// mentre la guardia dei contrasti — che legge il file col parser, non col browser — validava
// la prima dichiarazione e restava verde. Un duplicato nello stesso blocco non è mai una
// scelta: o è un refuso, o è una fusione andata storta. In entrambi i casi deve URLARE.

const CSS = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');

/** I blocchi top-level `selettore { ... }`, senza entrare nelle @media/@layer annidate. */
function blocchi(css: string): { selettore: string; corpo: string }[] {
  const fuori: { selettore: string; corpo: string }[] = [];
  let i = 0;
  while (i < css.length) {
    const apre = css.indexOf('{', i);
    if (apre === -1) break;
    const selettore = css.slice(i, apre).split('}').pop()!.trim().split('\n').pop()!.trim();
    let prof = 1;
    let j = apre + 1;
    while (j < css.length && prof > 0) {
      if (css[j] === '{') prof++;
      if (css[j] === '}') prof--;
      j++;
    }
    fuori.push({ selettore, corpo: css.slice(apre + 1, j - 1) });
    i = j;
  }
  return fuori;
}

describe('token duplicati (globals.css)', () => {
  const doppi: string[] = [];
  for (const b of blocchi(CSS)) {
    // Solo i blocchi che dichiarano custom property; i commenti non contano come dichiarazioni.
    const corpo = b.corpo.replace(/\/\*[\s\S]*?\*\//g, '');
    const visti = new Map<string, number>();
    for (const m of corpo.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
      visti.set(m[1], (visti.get(m[1]) ?? 0) + 1);
    }
    for (const [nome, n] of visti) {
      if (n > 1) doppi.push(`${b.selettore || '(blocco)'} → ${nome} dichiarato ${n} volte`);
    }
  }

  it('nessun token dichiarato due volte nello stesso blocco', () => {
    expect(
      doppi,
      'dichiarazione doppia: vince l\'ultima e la prima mente a chi legge il file — tieni un solo valore',
    ).toEqual([]);
  });

  it('la guardia sta davvero leggendo il file', () => {
    // Senza questo, un parser rotto passerebbe a vuoto: globals.css dichiara ben più di 50 token.
    const totale = [...CSS.matchAll(/--[a-z0-9-]+\s*:/gi)].length;
    expect(totale).toBeGreaterThan(50);
  });
});
