export type InfoChiave =
  | 'nominativo' | 'matricola' | 'pdr' | 'odsin' | 'via'
  | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria';

export interface TemplateInfoCampo {
  chiave: InfoChiave;
  etichetta: string;
  ordine: number;
}

/** Gli 11 campi anagrafici selezionabili, con etichetta di default. */
export const INFO_CAMPI_DISPONIBILI: { chiave: InfoChiave; etichettaDefault: string }[] = [
  { chiave: 'nominativo', etichettaDefault: 'NOMINATIVO' },
  { chiave: 'matricola', etichettaDefault: 'MATRICOLA' },
  { chiave: 'pdr', etichettaDefault: 'PDR' },
  { chiave: 'odsin', etichettaDefault: 'ODSIN' },
  { chiave: 'via', etichettaDefault: 'VIA' },
  { chiave: 'comune', etichettaDefault: 'COMUNE' },
  { chiave: 'cap', etichettaDefault: 'CAP' },
  { chiave: 'recapito', etichettaDefault: 'RECAPITO' },
  { chiave: 'attivita', etichettaDefault: 'ATTIVITA' },
  { chiave: 'accessibilita', etichettaDefault: 'ACCESSIBILITA' },
  { chiave: 'fascia_oraria', etichettaDefault: 'FASCIA ORARIA' },
];

const CHIAVI_NOTE = new Set<string>(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));

function defaultEtichetta(chiave: InfoChiave): string {
  return INFO_CAMPI_DISPONIBILI.find((c) => c.chiave === chiave)?.etichettaDefault ?? chiave;
}

/** Config di default = tutti gli 11 nell'ordine canonico (comportamento storico). */
export function infoCampiDefault(): TemplateInfoCampo[] {
  return INFO_CAMPI_DISPONIBILI.map((c, i) => ({
    chiave: c.chiave,
    etichetta: c.etichettaDefault,
    ordine: i + 1,
  }));
}

/**
 * Risolve lo snapshot in una lista ordinata di campi info.
 * - filtra le chiavi sconosciute
 * - ordina per `ordine`
 * - snapshot vuoto/assente → fallback a tutti gli 11 (comportamento attuale)
 */
export function resolveInfoCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): TemplateInfoCampo[] {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return infoCampiDefault();
  return snapshot
    .filter((c) => c && CHIAVI_NOTE.has(c.chiave))
    .map((c) => ({
      chiave: c.chiave,
      etichetta: (c.etichetta ?? '').trim() || defaultEtichetta(c.chiave),
      ordine: typeof c.ordine === 'number' ? c.ordine : 0,
    }))
    .sort((a, b) => a.ordine - b.ordine);
}

/** Record voce con i campi anagrafici (sottoinsieme di rapportino_voci). */
export type VoceInfo = Partial<Record<InfoChiave, string | null | undefined>>;

/** Estrae il valore (string) di un campo info da una voce. */
export function valoreInfo(voce: VoceInfo, chiave: InfoChiave): string {
  const v = voce[chiave];
  return v == null ? '' : String(v).trim();
}

/** Le 4 chiavi mostrate sempre nel sommario; tutte le altre vanno in "Dettagli". */
export const INFO_PRIMARI: InfoChiave[] = ['nominativo', 'via', 'comune', 'fascia_oraria'];

/**
 * Partiziona i campi info risolti in `primari` (sommario) e `dettaglio` (menu a tendina).
 * Riusa `resolveInfoCampi` quindi rispetta snapshot/ordine/etichette e i fallback.
 */
export function partitionInfoCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): { primari: TemplateInfoCampo[]; dettaglio: TemplateInfoCampo[] } {
  const risolti = resolveInfoCampi(snapshot);
  const primari = risolti.filter((c) => INFO_PRIMARI.includes(c.chiave));
  const dettaglio = risolti.filter((c) => !INFO_PRIMARI.includes(c.chiave));
  return { primari, dettaglio };
}
