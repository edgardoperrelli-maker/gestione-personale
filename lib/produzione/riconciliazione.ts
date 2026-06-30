// PURA: audit a tre vie DB ↔ master ↔ portale, agganciato per ODL. SOLO segnalazione (nessuna
// correzione). La produzione è ciò che è positivo per noi (DB+master); il SAL è ciò che il portale
// ACEA ha consuntivato (stato_norm = COMPLETATO). Lo scarto Produzione−SAL evidenzia il lavorato non
// ancora remunerato. Un ODL può ricadere in più classi di discrepanza (es. voce discorde + prod>SAL).

export type ClasseDiscrepanza =
  | 'DB_NON_IN_MASTER'
  | 'MASTER_NON_IN_DB'
  | 'POSITIVO_DB_NON_COMPLETATO_PORTALE'
  | 'COMPLETATO_PORTALE_NON_POSITIVO_DB'
  | 'VOCE_DISCORDE'
  | 'VOCE_NON_RISOLTA'
  | 'SOLO_PORTALE';

export interface DbRiga {
  voce: number | null;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=non lavorato
}
export interface MasterRiga {
  voce: number | null;
}
export interface PortaleRiga {
  statoNorm: string; // es. 'COMPLETATO'
}
export interface RiconciliazioneInput {
  db: Map<string, DbRiga>;
  master: Map<string, MasterRiga>;
  portale: Map<string, PortaleRiga>;
}
export interface Discrepanza {
  odl: string;
  classe: ClasseDiscrepanza;
}
export interface Totale {
  conteggio: number;
  valore: number;
}

// ordine deterministico delle classi entro lo stesso ODL
const ORDINE_CLASSI: ClasseDiscrepanza[] = [
  'SOLO_PORTALE',
  'DB_NON_IN_MASTER',
  'MASTER_NON_IN_DB',
  'POSITIVO_DB_NON_COMPLETATO_PORTALE',
  'COMPLETATO_PORTALE_NON_POSITIVO_DB',
  'VOCE_DISCORDE',
  'VOCE_NON_RISOLTA',
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function riconcilia(input: RiconciliazioneInput): Discrepanza[] {
  const { db, master, portale } = input;
  const odls = new Set<string>([...db.keys(), ...master.keys(), ...portale.keys()]);
  const out: Discrepanza[] = [];

  for (const odl of odls) {
    const d = db.get(odl);
    const m = master.get(odl);
    const p = portale.get(odl);
    const inDb = d != null;
    const inMaster = m != null;
    const inPortale = p != null;
    const positivo = inDb && d!.esitoOk === true;
    const completato = inPortale && p!.statoNorm === 'COMPLETATO';
    const produttivo = positivo || completato;
    const voceNota = (inDb ? d!.voce : null) ?? (inMaster ? m!.voce : null);

    const classi: ClasseDiscrepanza[] = [];

    // presenza (riconciliazione DB ↔ master, e ODL orfani del portale)
    if (inPortale && !inDb && !inMaster) {
      classi.push('SOLO_PORTALE');
    } else {
      if (inDb && !inMaster) classi.push('DB_NON_IN_MASTER');
      if (inMaster && !inDb) classi.push('MASTER_NON_IN_DB');
    }

    // produzione vs SAL (solo per ODL che conosciamo: inDb o inMaster)
    if (inDb || inMaster) {
      if (positivo && !completato) classi.push('POSITIVO_DB_NON_COMPLETATO_PORTALE');
      if (completato && !positivo) classi.push('COMPLETATO_PORTALE_NON_POSITIVO_DB');
    }

    // voce
    if (inDb && inMaster && d!.voce != null && m!.voce != null && d!.voce !== m!.voce) {
      classi.push('VOCE_DISCORDE');
    }
    if (produttivo && (inDb || inMaster) && voceNota == null) {
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
