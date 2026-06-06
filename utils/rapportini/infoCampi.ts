export type InfoChiave =
  | 'nominativo' | 'matricola' | 'pdr' | 'odl' | 'via'
  | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria'
  | 'coordinate';

export interface TemplateInfoCampo {
  chiave: InfoChiave;
  etichetta: string;
  ordine: number;
}

/** I campi anagrafici selezionabili (12). `coordinate` è opt-in: NON nel default, va aggiunta dal template. */
export const INFO_CAMPI_DISPONIBILI: { chiave: InfoChiave; etichettaDefault: string }[] = [
  { chiave: 'nominativo', etichettaDefault: 'NOMINATIVO' },
  { chiave: 'matricola', etichettaDefault: 'MATRICOLA' },
  { chiave: 'pdr', etichettaDefault: 'PDR' },
  { chiave: 'odl', etichettaDefault: 'ODS/ODL' },
  { chiave: 'via', etichettaDefault: 'VIA' },
  { chiave: 'comune', etichettaDefault: 'COMUNE' },
  { chiave: 'cap', etichettaDefault: 'CAP' },
  { chiave: 'recapito', etichettaDefault: 'RECAPITO' },
  { chiave: 'attivita', etichettaDefault: 'ATTIVITA' },
  { chiave: 'accessibilita', etichettaDefault: 'ACCESSIBILITA' },
  { chiave: 'fascia_oraria', etichettaDefault: 'FASCIA ORARIA' },
  { chiave: 'coordinate', etichettaDefault: 'COORDINATE' },
];

const CHIAVI_NOTE = new Set<string>(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));

function defaultEtichetta(chiave: InfoChiave): string {
  return INFO_CAMPI_DISPONIBILI.find((c) => c.chiave === chiave)?.etichettaDefault ?? chiave;
}

/** Config di default = gli 11 campi storici. `coordinate` è opt-in: va aggiunta dal template. */
export function infoCampiDefault(): TemplateInfoCampo[] {
  return INFO_CAMPI_DISPONIBILI
    .filter((c) => c.chiave !== 'coordinate')
    .map((c, i) => ({
      chiave: c.chiave,
      etichetta: c.etichettaDefault,
      ordine: i + 1,
    }));
}

/**
 * Risolve lo snapshot in una lista ordinata di campi info.
 * - filtra le chiavi sconosciute
 * - ordina per `ordine`
 * - snapshot vuoto/assente → fallback agli 11 storici (coordinate esclusa)
 */
export function resolveInfoCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): TemplateInfoCampo[] {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return infoCampiDefault();
  const CHIAVE_ALIAS: Record<string, InfoChiave> = { odsin: 'odl' };
  return snapshot
    .map((c) => (c && CHIAVE_ALIAS[c.chiave as string]
      ? { ...c, chiave: CHIAVE_ALIAS[c.chiave as string] }
      : c))
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

/**
 * Titolo della voce: primo campo non vuoto tra `titoloCampi` (priorità del template).
 * Se `titoloCampi` è vuoto → fallback robusto (nominativo → matricola → ODL → PDR), così le voci
 * senza nominativo/pdr (es. ACEA: solo matricola/ODL) non cadono su "Voce N". Ultimo fallback: "Voce N".
 */
export function titoloVoce(
  voce: VoceInfo,
  titoloCampi: InfoChiave[],
  indice: number,
): string {
  const chiavi = titoloCampi.length > 0
    ? titoloCampi
    : (['nominativo', 'matricola', 'odl', 'pdr'] as InfoChiave[]);
  for (const c of chiavi) {
    const v = valoreInfo(voce, c);
    if (v) return v;
  }
  return `Voce ${indice + 1}`;
}

/** Estrae la coordinata committente ("lat, lng") dal raw_json di una voce, o undefined. */
export function coordinateFromRaw(raw: unknown): string | undefined {
  const c = (raw as { coordinate?: unknown } | null | undefined)?.coordinate;
  return typeof c === 'string' && c.trim() !== '' ? c : undefined;
}
