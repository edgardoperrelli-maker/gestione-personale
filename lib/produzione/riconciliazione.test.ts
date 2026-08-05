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
    registro: parts.registro ?? new Map(),
    portale: parts.portale ?? new Map(),
  };
}
// per i test di regola "isolata" simuliamo snapshot popolati (l'audit ha senso solo allora)
const POP = { registroPopolato: true, portalePopolato: true };
const classi = (odl: string, ds: { odl: string; classe: ClasseDiscrepanza }[]) =>
  ds.filter((d) => d.odl === odl).map((d) => d.classe);

describe('riconcilia — gate su snapshot popolato', () => {
  it('master VUOTO → niente falsi DB_NON_IN_REGISTRO (il bug dei 6252)', () => {
    const out = riconcilia(mk({ db: new Map([['o1', { voce: 10, esitoOk: true }]]) }));
    expect(out).toEqual([]); // master/portale vuoti → nessuna discrepanza di presenza/SAL
  });

  it('portale VUOTO → niente classi di SAL (Produzione>SAL ecc.)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        registro: new Map([['o1', { voce: 10 }]]),
      }),
    );
    expect(classi('o1', out)).toEqual([]); // master coincide, portale vuoto → niente
  });
});

describe('riconcilia — classi isolate (snapshot popolati)', () => {
  it('DB positivo non presente nel master → DB_NON_IN_REGISTRO', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['DB_NON_IN_REGISTRO']);
  });

  it('master non presente nel DB → REGISTRO_NON_IN_DB', () => {
    const out = riconcilia(mk({ registro: new Map([['o1', { voce: 10 }]]) }), POP);
    expect(classi('o1', out)).toEqual(['REGISTRO_NON_IN_DB']);
  });

  it('positivo nel DB ma portale non COMPLETATO → POSITIVO_DB_NON_COMPLETATO_PORTALE', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        registro: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', { statoNorm: 'ASSEGNATO', esitoPositivoAcea: false }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['POSITIVO_DB_NON_COMPLETATO_PORTALE']);
  });

  it('portale COMPLETATO ma DB non positivo → COMPLETATO_PORTALE_NON_POSITIVO_DB', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: false }]]),
        registro: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['COMPLETATO_PORTALE_NON_POSITIVO_DB']);
  });

  it('voce DB diversa da voce master → VOCE_DISCORDE', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        registro: new Map([['o1', { voce: 11 }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['VOCE_DISCORDE']);
  });

  it('produttivo ma voce non derivabile → VOCE_NON_RISOLTA (anche a snapshot vuoti)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: null, esitoOk: true }]]),
        registro: new Map([['o1', { voce: null }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['VOCE_NON_RISOLTA']);
  });

  it('ODL solo nel portale → SOLO_PORTALE (e non COMPLETATO_NON_POSITIVO)', () => {
    const out = riconcilia(mk({ portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]) }), POP);
    expect(classi('o1', out)).toEqual(['SOLO_PORTALE']);
  });
});

describe('riconcilia — chiusure ACEA archiviate negative (i 639 del 2026-08-05)', () => {
  // Portale COMPLETATO con causale non-E = ACEA archivia il NON-fatto. Se anche da noi non c'è
  // un positivo, i due libri concordano: niente da segnalare — erano 639 falsi che seppellivano
  // le ~75 discrepanze vere («pagato senza rapportino»).
  const chiusoNegativo = { statoNorm: 'COMPLETATO', esitoPositivoAcea: false };

  it('nostro negativo + chiusura negativa ACEA → nessuna discrepanza (concordi)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: false }]]),
        registro: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', chiusoNegativo]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual([]);
  });

  it('mai visto nel DB + chiusura negativa ACEA → niente REGISTRO_NON_IN_DB né SOLO_PORTALE', () => {
    const out = riconcilia(
      mk({
        registro: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', chiusoNegativo], ['o2', chiusoNegativo]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual([]); // nel registro, mai nel DB: ordine morto, non un buco
    expect(classi('o2', out)).toEqual([]); // solo nel portale: idem
  });

  it('chiusura POSITIVA (E% o registro eseguito) senza positivo nostro → resta la discrepanza', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: false }]]),
        registro: new Map([['o1', { voce: 10 }]]),
        portale: new Map([['o1', { statoNorm: 'COMPLETATO', esitoPositivoAcea: true }]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['COMPLETATO_PORTALE_NON_POSITIVO_DB']);
  });

  it('nostro POSITIVO su chiusura negativa → le classi normali continuano a parlare', () => {
    // Qui i libri NON concordano (noi diciamo fatto, ACEA no): il silenzio vale solo quando
    // il non-fatto è concorde. Oggi nessuna classe copre questo caso specifico, ma la voce
    // non risolta e le presenze devono restare vive.
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: null, esitoOk: true }]]),
        registro: new Map([['o1', { voce: null }]]),
        portale: new Map([['o1', chiusoNegativo]]),
      }),
      POP,
    );
    expect(classi('o1', out)).toEqual(['VOCE_NON_RISOLTA']); // produttivo per il positivo NOSTRO
  });
});

describe('riconcilia — combinazioni e ordinamento', () => {
  it('un ODL può avere più discrepanze (voce discorde + produzione>SAL)', () => {
    const out = riconcilia(
      mk({
        db: new Map([['o1', { voce: 10, esitoOk: true }]]),
        registro: new Map([['o1', { voce: 11 }]]),
        portale: new Map([['zzz', { statoNorm: 'ASSEGNATO', esitoPositivoAcea: false }]]), // portale popolato, o1 assente
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
        registro: new Map([
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
