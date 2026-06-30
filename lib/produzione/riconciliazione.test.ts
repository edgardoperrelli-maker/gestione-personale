import { describe, expect, it } from 'vitest';
import {
  riconcilia,
  scartoProduzioneSal,
  type RiconciliazioneInput,
  type ClasseDiscrepanza,
} from './riconciliazione';

function mk(parts: Partial<RiconciliazioneInput>): RiconciliazioneInput {
  return {
    db: parts.db ?? new Map(),
    master: parts.master ?? new Map(),
    portale: parts.portale ?? new Map(),
  };
}
// per i test di regola "isolata" simuliamo snapshot popolati (l'audit ha senso solo allora)
const POP = { masterPopolato: true, portalePopolato: true };
const classi = (odl: string, ds: { odl: string; classe: ClasseDiscrepanza }[]) =>
  ds.filter((d) => d.odl === odl).map((d) => d.classe);

describe('riconcilia — gate su snapshot popolato', () => {
  it('master VUOTO → niente falsi DB_NON_IN_MASTER (il bug dei 6252)', () => {
    const out = riconcilia(mk({ db: new Map([['o1', { voce: 10, esitoOk: true }]]) }));
    expect(out).toEqual([]); // master/portale vuoti → nessuna discrepanza di presenza/SAL
  });

  it('portale VUOTO → niente classi di SAL (Produzione>SAL ecc.)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        master: new Map([['o1', { voce: 10 }]]),
      }),
    );
    expect(classi('o1', out)).toEqual([]); // master coincide, portale vuoto → niente
  });
});

describe('riconcilia — classi isolate (snapshot popolati)', () => {
  it('DB positivo non presente nel master → DB_NON_IN_MASTER', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO' }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['DB_NON_IN_MASTER']);
  });

  it('master non presente nel DB → MASTER_NON_IN_DB', () => {
    const out = riconcilia(mk({ master: new Map([['o1', { voce: 10 }]]) }), POP);
    expect(classi('o1', out)).toEqual(['MASTER_NON_IN_DB']);
  });

  it('positivo nel DB ma portale non COMPLETATO → POSITIVO_DB_NON_COMPLETATO_PORTALE', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        master: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', { statoNorm: 'ASSEGNATO' }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['POSITIVO_DB_NON_COMPLETATO_PORTALE']);
  });

  it('portale COMPLETATO ma DB non positivo → COMPLETATO_PORTALE_NON_POSITIVO_DB', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: false }]]),
        master: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO' }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['COMPLETATO_PORTALE_NON_POSITIVO_DB']);
  });

  it('voce DB diversa da voce master → VOCE_DISCORDE', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        master: new Map([['o1', { voce: 11 }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO' }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['VOCE_DISCORDE']);
  });

  it('produttivo ma voce non derivabile → VOCE_NON_RISOLTA (anche a snapshot vuoti)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: null, esitoOk: true }]]),
        master: new Map([['o1', { voce: null }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO' }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['VOCE_NON_RISOLTA']);
  });

  it('ODL solo nel portale → SOLO_PORTALE (e non COMPLETATO_NON_POSITIVO)', () => {
    const out = riconcilia(mk({ portale: new Map([['o1', { statoNorm: 'COMPLETATO' }]]) }), POP);
    expect(classi('o1', out)).toEqual(['SOLO_PORTALE']);
  });
});

describe('riconcilia — combinazioni e ordinamento', () => {
  it('un ODL può avere più discrepanze (voce discorde + produzione>SAL)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        master: new Map([['o1', { voce: 11 }]]),
        portale: new Map([['zzz', { statoNorm: 'ASSEGNATO' }]]), // portale popolato, o1 assente
      }),
      POP,
    );
    expect(new Set(classi('o1', out))).toEqual(
      new Set(['POSITIVO_DB_NON_COMPLETATO_PORTALE', 'VOCE_DISCORDE']),
    );
  });

  it('output ordinato per ODL crescente', () => {
    const out = riconcilia(
      mk({
        master: new Map([
          ['o2', { voce: 10 }],
          ['o1', { voce: 10 }],
        ]),
      }),
      POP,
    );
    expect(out.map((d) => d.odl)).toEqual(['o1', 'o2']);
  });
});

describe('scartoProduzioneSal', () => {
  it('produzione − SAL su conteggio e valore', () => {
    expect(
      scartoProduzioneSal({ conteggio: 10, valore: 1000 }, { conteggio: 7, valore: 700 }),
    ).toEqual({ conteggio: 3, valore: 300 });
  });
});
