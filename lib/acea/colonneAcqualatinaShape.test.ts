import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLONNE_ACQUALATINA, COLONNE_DUNNING, COLONNE_MASSIVE } from './colonneTabella';

describe('vista AcquaLatina: Esito al posto di Stato', () => {
  it("la colonna «Stato» non c'è più", () => {
    // Diceva «Aperta» su quasi tutte le righe: l'ufficio la guardava per sapere com'è finita
    // un'uscita e non lo trovava lì.
    expect(COLONNE_ACQUALATINA.find((c) => c.chiave === 'stato')).toBeUndefined();
  });

  it("c'è «Esito», ed è predefinita", () => {
    const c = COLONNE_ACQUALATINA.find((x) => x.chiave === 'eseguito');
    expect(c).toBeDefined();
    expect(c?.intestazione).toBe('Esito');
    expect(c?.predefinita).toBe(true);
  });

  it("non porta l'imbuto, e non è una dimenticanza", () => {
    // Il valore non sta nel registro ma nelle risposte dei rapportini: un filtro che agisse sulle
    // sole righe caricate direbbe una bugia sul conteggio. Stessa scelta di «Eseguito» nelle
    // massive.
    const c = COLONNE_ACQUALATINA.find((x) => x.chiave === 'eseguito');
    expect(c?.filtro).toBeUndefined();
  });

  it("le altre viste tengono il loro «Stato ordine»: la sostituzione è di questa commessa", () => {
    // Su ACEA lo stato arriva dal Cruscotto del committente ed è il dato vero, non una nostra
    // derivazione: là la colonna resta, con il suo imbuto.
    for (const [nome, colonne] of [['dunning', COLONNE_DUNNING], ['massive', COLONNE_MASSIVE]] as const) {
      const c = colonne.find((x) => x.chiave === 'stato');
      expect(c, `${nome} deve tenere la colonna Stato`).toBeDefined();
      expect(c?.filtro, `${nome} deve tenere l'imbuto sullo Stato`).toBeDefined();
    }
  });
});

describe("la route accende l'esito anche per AcquaLatina", () => {
  const route = readFileSync(
    resolve(__dirname, '../../app/api/acea/ordini/route.ts'),
    'utf8',
  );

  it("l'estrattore vale per massive E acqualatina", () => {
    // Nessuna query in più: è la stessa lettura che già serve `matricola_nuova` alla vista
    // AcquaLatina, con un estrattore acceso in più — la strada che il commento della route
    // aveva previsto per iscritto.
    expect(route).toMatch(/const serveEseguito = f\.famiglia === 'massive' \|\| acqua;/);
  });
});
