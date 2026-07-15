/** Particelle dei cognomi composti (italiane + comuni straniere): assorbono il token successivo,
 *  così "DE SANTIS ALESSANDRO" → "DE SANTIS" e non il troncone "DE" (che sul file generava un
 *  conflitto per ogni riga contro il "DE SANTIS" scritto dall'ufficio). */
const PARTICELLE_COGNOME = new Set([
  'DE', 'DI', 'DEL', 'DELLO', 'DELLA', 'DELLE', 'DEI', 'DEGLI',
  'DA', 'DAL', 'DALLO', 'DALLA', 'DALLE',
  'LA', 'LO', 'LE', 'LI', 'SAN', 'SANTA', 'VAN', 'VON', 'MAC', 'MC',
]);

/** display_name "COGNOME NOME" (maiuscolo) → il cognome, particelle incluse ("DE SANTIS"), maiuscolo. */
export function cognomeDaDisplayName(displayName: string | null | undefined): string {
  const s = String(displayName ?? '').trim();
  if (!s) return '';
  const tokens = s.split(/\s+/).map((t) => t.toUpperCase());
  let fine = 1; // quanti token compongono il cognome: finché l'ultimo incluso è una particella, assorbi il successivo
  while (fine < tokens.length && PARTICELLE_COGNOME.has(tokens[fine - 1])) fine++;
  return tokens.slice(0, fine).join(' ');
}

/** 'eseguito' se positivo, 'No' se lavorato-ma-non-positivo, null se non lavorato. */
export function esitoFileDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): 'eseguito' | 'No' | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? 'eseguito' : 'No';
}

/** true=positivo, false=lavorato-ma-negativo, null=non lavorato. Booleano gemello di esitoFileDaIntervento. */
export function esitoOkDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): boolean | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? true : false;
}

/** Riga di output dell'endpoint: una limitazione lavorata, già tradotta per il file. */
export type RigaLimMassive = {
  id: string;
  odl: string;
  matricola: string;
  comune: string;
  via: string;
  esecutore: string;
  data_esecuzione: string; // 'YYYY-MM-DD'
  esito: 'eseguito' | 'No' | null;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=non lavorato
  esito_motivo: string | null;
  sigillo: string;
  pdr: string;
  nominativo: string;
  saracinesca: string;
  note: string; // nota da scrivere SOLO quando l'esito è negativo (coalesce note→esito_motivo); '' altrimenti
  manuale: boolean;
};

/** Riga DB (interventi + staff.display_name + sigillo dalla voce). */
export type RigaDb = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null; // 'YYYY-MM-DD'
  committente: string | null;
  origine: string | null;
  display_name: string | null;
  sigillo: string | null;
  pdr: string | null;
  nominativo: string | null;
  saracinesca: string | null;
  note: string | null; // rapportino_voci.risposte->>'note' (fonte primaria della nota)
};

const t = (v: string | null | undefined): string => String(v ?? '').trim();

/**
 * La saracinesca è un valore breve (SI/NO/testo). In alcuni template la chiave
 * `sost_valvola` è in realtà un campo FOTO → contiene un percorso/URL (es.
 * "rapportini/…/x.jpg"): va scartato, altrimenti l'agente scriverebbe il link.
 */
export function saracinescaPulita(v: string | null | undefined): string {
  const s = t(v);
  if (!s) return '';
  const low = s.toLowerCase();
  const sembraFileOLink =
    low.includes('http') ||
    low.includes('blob:') ||
    low.includes('blob-locale') ||
    s.includes('/') ||
    s.includes('\\') ||
    /\.(jpe?g|png|heic|webp|gif|bmp|pdf)$/i.test(s);
  return sembraFileOLink ? '' : s;
}

/**
 * Valore saracinesca dalle due chiavi possibili del rapportino (`sostituzione_valvola`,
 * `sost_valvola`), tollerante al TIPO: alcuni template salvano un booleano (checkbox →
 * `true`), altri una stringa ("SI"/testo) o un path-foto (da scartare). Il booleano `true`
 * diventa "SI"; le stringhe passano da `saracinescaPulita` (che scarta i path). Ritorna il
 * primo valore valido tra le due chiavi. Senza questa normalizzazione l'export scartava le
 * valvole salvate come booleano (viste "SI" nello storico ma perse dall'agente).
 */
export function valoreSaracinesca(sostituzioneValvola: unknown, sostValvola: unknown): string {
  const norm = (raw: unknown): string => {
    if (raw === true) return 'SI';
    if (typeof raw === 'string') return saracinescaPulita(raw);
    return '';
  };
  return norm(sostituzioneValvola) || norm(sostValvola);
}

export function buildRigaLimMassive(r: RigaDb): RigaLimMassive {
  const esitoOk = esitoOkDaIntervento(r.stato, r.esito);
  return {
    id: t(r.id),
    odl: t(r.odl),
    matricola: t(r.matricola_contatore),
    comune: t(r.comune),
    via: t(r.indirizzo),
    esecutore: cognomeDaDisplayName(r.display_name),
    data_esecuzione: t(r.data),
    esito: esitoFileDaIntervento(r.stato, r.esito),
    esitoOk,
    esito_motivo: t(r.esito_motivo) || null,
    sigillo: t(r.sigillo),
    pdr: t(r.pdr),
    nominativo: t(r.nominativo),
    saracinesca: saracinescaPulita(r.saracinesca),
    // nota solo sui negativi (esitoOk === false): prima la nota del rapportino, poi il motivo
    note: esitoOk === false ? (t(r.note) || t(r.esito_motivo)) : '',
    manuale: r.committente === 'lim_massive' || r.origine === 'manuale',
  };
}
