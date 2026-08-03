import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Il ricalcolo dei misuratori è UN motore per due commesse. Questi test non provano la logica
  (che ha bisogno del DB): proteggono la CONDIVISIONE, che è la cosa che si rompe da sola.
  Il modo in cui ACEA e AcquaLatina erano divergute è esattamente questo — una route che si
  porta la sua copia della logica — e senza una guardia il prossimo fix applicato da una parte
  sola ricrea il buco che il 2026-08-03 è costato un registro vuoto a fronte di 212 interventi.
*/

const leggi = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const motore = leggi('./sincronizzaRegistro.ts');
const routeAcea = leggi('../../app/api/misuratori/sync/route.ts');
const routeAcqua = leggi('../../app/api/acqualatina/misuratori/sync/route.ts');
const paginaAcqua = leggi('../../app/hub/acqualatina/misuratori/page.tsx');

describe('ricalcolo misuratori — un motore, due commesse', () => {
  it('entrambe le route chiamano il motore condiviso', () => {
    for (const [nome, src] of [['ACEA', routeAcea], ['AcquaLatina', routeAcqua]] as const) {
      expect(src, `${nome} deve importare il motore`).toMatch(
        /from '@\/lib\/misuratori\/sincronizzaRegistro'/,
      );
      expect(src, `${nome} deve invocarlo`).toMatch(/sincronizzaRegistro\(COMMESSA_/);
    }
  });

  it('nessuna route si riporta dentro la logica del ricalcolo', () => {
    // Le spie sono i gesti che SOLO il motore deve fare: leggere gli interventi, cancellare
    // dal registro, inserire le righe. Una route che li rifà è una copia che ricomincia a
    // divergere — ed è così che è nato il problema.
    for (const [nome, src] of [['ACEA', routeAcea], ['AcquaLatina', routeAcqua]] as const) {
      expect(src, `${nome} non deve interrogare interventi`).not.toMatch(/from\('interventi'\)/);
      expect(src, `${nome} non deve scrivere sul registro`).not.toMatch(/\.upsert\(|\.delete\(/);
      expect(src, `${nome} non deve leggere le voci`).not.toMatch(/rapportino_voci/);
    }
  });

  it('le due commesse differiscono SOLO nei quattro campi dichiarati', () => {
    const campi = (blocco: string) =>
      [...blocco.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort();
    const acea = motore.match(/COMMESSA_ACEA: CommessaRegistro = \{[\s\S]*?\};/)?.[0] ?? '';
    const acqua = motore.match(/COMMESSA_ACQUALATINA: CommessaRegistro = \{[\s\S]*?\};/)?.[0] ?? '';
    expect(acea).not.toBe('');
    expect(acqua).not.toBe('');
    expect(campi(acea)).toEqual(['committente', 'conPdr', 'soloRimozioni', 'tabella']);
    expect(campi(acqua)).toEqual(campi(acea));

    // I valori che rendono le due commesse diverse, e il perché sta nel commento accanto:
    // ACEA ha un catalogo largo e il PDR del gas, AcquaLatina né l'uno né l'altro.
    expect(acea).toMatch(/soloRimozioni: true/);
    expect(acea).toMatch(/conPdr: true/);
    expect(acqua).toMatch(/soloRimozioni: false/);
    expect(acqua).toMatch(/conPdr: false/);
  });

  it('il PDR entra nel payload solo dove la colonna esiste', () => {
    // `acqualatina_misuratori_rimossi` non ha la colonna: scriverla farebbe fallire l'insert
    // INTERO, cioè il ricalcolo che serve proprio a quella commessa.
    expect(motore).toMatch(/if \(c\.conPdr\) riga\.pdr =/);
  });

  it('nessuna lettura senza paginazione: PostgREST tronca a 1000 in silenzio', () => {
    // Una troncatura sul set qualificante non è una lista corta: è il passo di RIMOZIONE che
    // cancella righe sane perché non le ha viste.
    const range = motore.match(/\.range\(/g) ?? [];
    expect(range.length).toBeGreaterThanOrEqual(2);
    expect(motore).toMatch(/const PAGINA = 1000/);
  });
});

describe('ricalcolo misuratori — AcquaLatina ha il pulsante', () => {
  it('«Ricalcola» è acceso sul registro AcquaLatina', () => {
    // Era spento: il registro si popolava solo in avanti, all'invio del rapportino, e il
    // pregresso non aveva nessuna porta per entrare.
    expect(paginaAcqua).toMatch(/mostraRicalcola(?!=\{false\})/);
    expect(paginaAcqua).not.toMatch(/mostraRicalcola=\{false\}/);
  });

  it("l'apiBase del registro è quello della commessa, non quello ACEA", () => {
    // Il client compone `${apiBase}/sync`: sbagliarlo qui ricalcolerebbe il registro dell'altro.
    expect(paginaAcqua).toMatch(/apiBase="\/api\/acqualatina\/misuratori"/);
  });
});
