/*
  PURA: audit a tre vie DB ↔ REGISTRO ↔ portale, agganciato per ODL. SOLO segnalazione (nessuna
  correzione). Il SAL è ciò che il portale ACEA ha consuntivato (stato_norm = COMPLETATO), e lo
  scarto Produzione−SAL evidenzia il lavorato non ancora remunerato. Un ODL può ricadere in più
  classi (es. voce discorde + prod>SAL).

  La colonna di mezzo era il MASTER — la fotografia dei file SharePoint che un agente leggeva da
  un PC acceso in ufficio. Dal 2026-08-03 è il REGISTRO del modulo ACEA (`acea_ordini`), che dice
  le stesse cose, si aggiorna con l'import ufficiale del Cruscotto e non dipende da nessuna
  macchina. L'agente resta vivo solo per Playwright, che è l'unico a sapere cosa ACEA ha davvero
  contabilizzato — quella colonna, la terza, non si tocca.
*/

export type ClasseDiscrepanza =
  | 'DB_NON_IN_REGISTRO'
  | 'REGISTRO_NON_IN_DB'
  | 'POSITIVO_DB_NON_COMPLETATO_PORTALE'
  | 'COMPLETATO_PORTALE_NON_POSITIVO_DB'
  | 'VOCE_DISCORDE'
  | 'VOCE_NON_RISOLTA'
  | 'SOLO_PORTALE';

export interface DbRiga {
  voce: number | null;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=non lavorato
}
export interface RegistroRiga {
  voce: number | null;
}
export interface PortaleRiga {
  statoNorm: string; // es. 'COMPLETATO'
}
export interface RiconciliazioneInput {
  db: Map<string, DbRiga>;
  registro: Map<string, RegistroRiga>;
  portale: Map<string, PortaleRiga>;
}
export interface Discrepanza {
  odl: string;
  classe: ClasseDiscrepanza;
}
export interface RiconciliaOpts {
  /** Default: registro.size > 0. Se false, le classi che dipendono dal registro NON vengono emesse
   *  (un registro vuoto non significa "tutto assente dal registro" → sarebbero migliaia di falsi). */
  registroPopolato?: boolean;
  /** Default: portale.size > 0. Idem per le classi SAL (basate sullo stato portale). */
  portalePopolato?: boolean;
}
export interface Totale {
  conteggio: number;
  valore: number;
}

// ordine deterministico delle classi entro lo stesso ODL
const ORDINE_CLASSI: ClasseDiscrepanza[] = [
  'SOLO_PORTALE',
  'DB_NON_IN_REGISTRO',
  'REGISTRO_NON_IN_DB',
  'POSITIVO_DB_NON_COMPLETATO_PORTALE',
  'COMPLETATO_PORTALE_NON_POSITIVO_DB',
  'VOCE_DISCORDE',
  'VOCE_NON_RISOLTA',
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function riconcilia(input: RiconciliazioneInput, opts: RiconciliaOpts = {}): Discrepanza[] {
  const { db, registro, portale } = input;
  const registroPop = opts.registroPopolato ?? registro.size > 0;
  const portalePop = opts.portalePopolato ?? portale.size > 0;
  const odls = new Set<string>([...db.keys(), ...registro.keys(), ...portale.keys()]);
  const out: Discrepanza[] = [];

  for (const odl of odls) {
    const d = db.get(odl);
    const m = registro.get(odl);
    const p = portale.get(odl);
    const inDb = d != null;
    const inRegistro = m != null;
    const inPortale = p != null;
    const positivo = inDb && d!.esitoOk === true;
    const completato = inPortale && p!.statoNorm === 'COMPLETATO';
    const produttivo = positivo || completato;
    const voceNota = (inDb ? d!.voce : null) ?? (inRegistro ? m!.voce : null);

    const classi: ClasseDiscrepanza[] = [];

    // presenza (riconciliazione DB ↔ registro, e ODL orfani del portale).
    // Le classi del registro si emettono SOLO se il registro è popolato: con una lettura fallita
    // ogni ODL risulterebbe «non nel registro», e l'audit diventerebbe un muro di falsi.
    if (inPortale && !inDb && !inRegistro) {
      if (portalePop) classi.push('SOLO_PORTALE');
    } else if (registroPop) {
      if (inDb && !inRegistro) classi.push('DB_NON_IN_REGISTRO');
      if (inRegistro && !inDb) classi.push('REGISTRO_NON_IN_DB');
    }

    // produzione vs SAL (basata sul portale): solo se lo snapshot portale è popolato.
    if (portalePop && (inDb || inRegistro)) {
      if (positivo && !completato) classi.push('POSITIVO_DB_NON_COMPLETATO_PORTALE');
      if (completato && !positivo) classi.push('COMPLETATO_PORTALE_NON_POSITIVO_DB');
    }

    // voce discorde (richiede il registro popolato)
    if (registroPop && inDb && inRegistro && d!.voce != null && m!.voce != null && d!.voce !== m!.voce) {
      classi.push('VOCE_DISCORDE');
    }
    if (produttivo && (inDb || inRegistro) && voceNota == null) {
      classi.push('VOCE_NON_RISOLTA');
    }

    classi.sort((a, b) => ORDINE_CLASSI.indexOf(a) - ORDINE_CLASSI.indexOf(b));
    for (const classe of classi) out.push({ odl, classe });
  }

  out.sort((a, b) =>
    a.odl < b.odl ? -1 : a.odl > b.odl ? 1 : ORDINE_CLASSI.indexOf(a.classe) - ORDINE_CLASSI.indexOf(b.classe),
  );
  return out;
}

/** Differenza aggregata Produzione − SAL (conteggio e valore). */
export function scartoProduzioneSal(produzione: Totale, sal: Totale): Totale {
  return {
    conteggio: produzione.conteggio - sal.conteggio,
    valore: round2(produzione.valore - sal.valore),
  };
}
