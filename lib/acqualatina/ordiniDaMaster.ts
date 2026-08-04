// PURA: dal master del committente alle righe nuove del registro `acqualatina_ordini`.
//
// Il master (Impostazioni → Template master, committente acqualatina) è l'elenco dei punti della
// campagna: odl, matricola, indirizzo, comune, più l'anagrafica del punto e dell'utente (cod.
// fornitura, nome, recapito). Questo modulo decide TRE cose, e sono le tre che sbagliate
// corrompono il registro in silenzio:
//
//  1. l'IDENTITÀ della riga: la coppia (ODL, matricola). Nel file di Terracina 109 ODL coprono
//     da 2 a 5 contatori (condomìni) — l'ODL da solo non identifica niente;
//  2. il NUMERO OPERAZIONE: progressivo per ODL ('1', '2', …), stabile fra un sync e l'altro —
//     le righe già a registro TENGONO il loro numero, le matricole nuove prendono il successivo.
//     È la seconda metà della chiave di riga (`odl|numero_operazione`), come su ACEA;
//  3. lo SPACCO dell'indirizzo in via + civico: il registro ordina per strada e civico NUMERICO
//     (`civico_num` è generata dal civico), e un indirizzo lasciato intero ordinerebbe
//     «VIA ROMA 10» prima di «VIA ROMA 9».
//
// Additivo sugli STATI, correttivo sull'ANAGRAFICA: le righe nuove entrano, e sulle presenti
// il master sovrascrive i campi anagrafici difformi (mai stati, pianificazione o matricola —
// vedi `EsitoSync.correzioni`). Niente si cancella mai per assenza dal file.

export type RigaMaster = {
  /** `template_master_righe.id`: la provenienza si conserva sulla riga di registro. */
  id: string;
  odl: string | null;
  matricola: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  /*
    L'anagrafica del PUNTO e dell'UTENTE, che il sync non portava.

    L'impianto (COD_FORNITURA nel file del committente) è arrivato a registro con una
    correzione una tantum: il sync non l'ha mai scritto, quindi il prossimo master sarebbe
    entrato di nuovo senza — stesso buco, un mese dopo. Nome utente e recapito non c'erano
    proprio: il parser del master li scartava e nessuna colonna li aspettava.

    Tutti e tre nullable: un master che non li porta non è un file rotto, è un file più
    povero, e le righe entrano lo stesso.
  */
  impianto: string | null;
  nominativo: string | null;
  recapito: string | null;
};

export type OrdineEsistente = {
  odl: string;
  numero_operazione: string;
  matricola: string | null;
  /** L'anagrafica che la riga ha GIÀ: il confronto decide se il master la corregge. */
  impianto?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
  comune?: string | null;
  cap?: string | null;
  via?: string | null;
  civico?: string | null;
};

/** I campi che un master può correggere su una riga già a registro. */
export type CampoAnagrafica =
  | 'impianto' | 'nominativo' | 'recapito' | 'comune' | 'cap' | 'via' | 'civico';

/**
 * Una riga già a registro che il master aggiorna: anagrafica difforme, e/o la matricola
 * che una riga entrata senza (i battenti del sito non la portano) adotta dal primo file
 * che gliela dà.
 */
export type Correzione = {
  odl: string;
  numero_operazione: string;
  patch: Partial<Record<CampoAnagrafica | 'matricola' | 'matricola_norm', string>>;
};

export type NuovoOrdine = {
  odl: string;
  numero_operazione: string;
  matricola: string;
  matricola_norm: string;
  via: string | null;
  civico: string | null;
  comune: string | null;
  cap: string | null;
  impianto: string | null;
  nominativo: string | null;
  recapito: string | null;
  master_riga_id: string;
};

export type EsitoSync = {
  nuovi: NuovoOrdine[];
  /**
   * Righe già a registro che il master AGGIORNA.
   *
   * Fino al 04/08/2026 il sync riempiva solo i campi VUOTI: un dato corretto in ufficio non
   * si toccava. Ma la correzione vera viaggia in senso opposto — l'export del committente È
   * l'anagrafica giusta (decisione utente 04/08: «l'import del master deve sovrascrivere i
   * dati»), e tenere il valore vecchio significava correggere a mano due volte, sul registro
   * e sugli interventi. Ora un campo NON VUOTO del file che differisce dal registro lo
   * sovrascrive; un campo vuoto continua a non cancellare niente.
   *
   * La MATRICOLA resta fuori dalla sovrascrittura: è l'identità della riga (indice unico su
   * odl + matricola_norm), e una matricola «diversa» non è una correzione, è un'altra riga.
   * L'unico movimento ammesso è l'ADOZIONE: la riga entrata senza matricola (i battenti del
   * sito non la portano) prende la prima che un file le dà.
   */
  correzioni: Correzione[];
  /** Righe del file già a registro (per coppia ODL+matricola, o per ODL se senza matricola). */
  giaPresenti: number;
  /** Righe del master inutilizzabili (senza ODL) o duplicate nel file stesso. */
  scartate: number;
};

/** Matricola normalizzata per il confronto: maiuscola, senza separatori. '' se assente. */
export function normMatricola(m: string | null | undefined): string {
  return String(m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Via + civico da un indirizzo scritto in un campo solo.
 *
 * Il civico è l'ULTIMO token che inizia con una cifra («12», «12/A», «12B»): è la forma del
 * master di Terracina (2.962 righe su 4.196 finiscono con un numero). Un indirizzo senza quel
 * token resta tutto nella via, con civico nullo — meglio un civico assente di uno inventato
 * spezzando male: la colonna si legge comunque intera (via + civico ricomposti).
 */
export function spezzaIndirizzo(
  indirizzo: string | null | undefined,
): { via: string | null; civico: string | null } {
  const testo = String(indirizzo ?? '').replace(/\s+/g, ' ').trim();
  if (testo === '') return { via: null, civico: null };
  const m = /^(.*?)[\s,]+(\d\S*)$/.exec(testo);
  if (!m) return { via: testo, civico: null };
  const via = m[1].replace(/[\s,]+$/, '').trim();
  // Un "indirizzo" che è solo un numero non ha una via da estrarre: si tiene com'è.
  if (via === '') return { via: testo, civico: null };
  return { via, civico: m[2] };
}

/** Normalizzazione per il CONFRONTO anagrafico (non per la scrittura): maiuscolo, spazi
 *  collassati. Una differenza di solo case o spaziatura non è una correzione da scrivere. */
export function normAnagrafica(v: string | null | undefined): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** I campi difformi che il file sovrascrive sulla riga presente. Il file che non porta un
 *  dato (campo vuoto) non cancella mai niente; via e civico si confrontano già spezzati. */
function patchAnagrafica(r: RigaMaster, presente: OrdineEsistente): Correzione['patch'] {
  const { via, civico } = spezzaIndirizzo(r.indirizzo);
  const confronti: ReadonlyArray<[CampoAnagrafica, string | null | undefined, string | null | undefined]> = [
    ['impianto', r.impianto, presente.impianto],
    ['nominativo', r.nominativo, presente.nominativo],
    ['recapito', r.recapito, presente.recapito],
    ['comune', r.comune, presente.comune],
    ['cap', r.cap, presente.cap],
    ['via', via, presente.via],
    ['civico', civico, presente.civico],
  ];
  const patch: Correzione['patch'] = {};
  for (const [campo, dalFile, aRegistro] of confronti) {
    const nf = normAnagrafica(dalFile);
    if (nf === '' || nf === normAnagrafica(aRegistro)) continue;
    patch[campo] = String(dalFile).replace(/\s+/g, ' ').trim();
  }
  return patch;
}

/**
 * Le righe NUOVE da inserire a registro (con il loro numero operazione) e le CORREZIONI da
 * scrivere su quelle già presenti.
 *
 * Regole di numerazione, nell'ordine:
 *  - le righe esistenti dello stesso ODL riservano i loro numeri: MAI rinumerare — la chiave
 *    `odl|numero_operazione` è in giro (selezioni, appunti, log operazioni);
 *  - le matricole nuove si ordinano alfabeticamente (normalizzate) e prendono i numeri liberi a
 *    salire dal massimo esistente: due sync con lo stesso file producono le stesse chiavi.
 *
 * Le correzioni sono l'unica cosa che tocca una riga presente, e toccano SOLO l'anagrafica
 * (mai stati, pianificazione, note): rieseguire il sync sullo stesso file produce zero
 * correzioni al secondo giro.
 *
 * Righe SENZA matricola (i battenti del sito): l'identità degrada all'ODL. Se l'ODL è già a
 * registro la riga è un veicolo di correzioni per TUTTE le sue operazioni; se non c'è entra
 * come riga nuova a matricola vuota, che un master futuro potrà far adottare.
 */
export function ordiniDaMaster(
  righe: readonly RigaMaster[],
  esistenti: readonly OrdineEsistente[],
): EsitoSync {
  // Cosa c'è già, per ODL: le righe, le matricole presenti e il numero più alto assegnato.
  const perOdl = new Map<string, { righe: OrdineEsistente[]; matricole: Set<string>; maxNumero: number }>();
  for (const e of esistenti) {
    const odl = e.odl.trim();
    if (odl === '') continue;
    const v = perOdl.get(odl) ?? { righe: [], matricole: new Set<string>(), maxNumero: 0 };
    v.righe.push(e);
    const m = normMatricola(e.matricola);
    if (m !== '') v.matricole.add(m);
    const n = Number.parseInt(e.numero_operazione, 10);
    if (Number.isFinite(n) && n > v.maxNumero) v.maxNumero = n;
    perOdl.set(odl, v);
  }

  // Le candidate valide e non ancora presenti, deduplicate anche DENTRO il file.
  const candidate = new Map<string, RigaMaster[]>();
  const correzioni: Correzione[] = [];
  let giaPresenti = 0;
  let scartate = 0;
  const vistoNelFile = new Set<string>();
  // Le righe senza matricola già adottanti in questo giro: una riga vuota adotta UNA matricola.
  const adottate = new Set<OrdineEsistente>();

  const correggi = (r: RigaMaster, presente: OrdineEsistente, extra?: Correzione['patch']) => {
    const patch = { ...patchAnagrafica(r, presente), ...extra };
    if (Object.keys(patch).length > 0) {
      correzioni.push({ odl: presente.odl.trim(), numero_operazione: presente.numero_operazione, patch });
    }
  };

  for (const r of righe) {
    const odl = String(r.odl ?? '').trim();
    const matricola = String(r.matricola ?? '').trim();
    const norm = normMatricola(matricola);
    if (odl === '') {
      scartate++;
      continue;
    }
    const chiave = `${odl}#${norm}`;
    if (vistoNelFile.has(chiave)) {
      scartate++;
      continue;
    }
    vistoNelFile.add(chiave);
    const gruppo = perOdl.get(odl);
    if (gruppo) {
      if (norm === '') {
        // Senza matricola l'identità è l'ODL, che c'è già: la riga corregge tutte le sue
        // operazioni (l'anagrafica dell'utenza è una) e non inserisce niente.
        giaPresenti++;
        for (const e of gruppo.righe) correggi(r, e);
        continue;
      }
      if (gruppo.matricole.has(norm)) {
        giaPresenti++;
        const presente = gruppo.righe.find((e) => normMatricola(e.matricola) === norm);
        if (presente) correggi(r, presente);
        continue;
      }
      // Matricola nuova su un ODL noto: se c'è una riga entrata senza matricola, la ADOTTA —
      // è la stessa riga di lavoro, arrivata prima da un file più povero. Inserirne una
      // seconda sdoppierebbe il punto.
      const vuota = gruppo.righe.find((e) => normMatricola(e.matricola) === '' && !adottate.has(e));
      if (vuota) {
        adottate.add(vuota);
        gruppo.matricole.add(norm);
        giaPresenti++;
        correggi(r, vuota, { matricola, matricola_norm: norm });
        continue;
      }
    }
    candidate.set(odl, [...(candidate.get(odl) ?? []), r]);
  }

  const nuovi: NuovoOrdine[] = [];
  for (const [odl, lista] of candidate) {
    const ordinate = [...lista].sort((a, b) =>
      normMatricola(a.matricola).localeCompare(normMatricola(b.matricola)));
    let prossimo = (perOdl.get(odl)?.maxNumero ?? 0) + 1;
    for (const r of ordinate) {
      const { via, civico } = spezzaIndirizzo(r.indirizzo);
      const matricola = String(r.matricola ?? '').trim();
      nuovi.push({
        odl,
        numero_operazione: String(prossimo++),
        matricola,
        matricola_norm: normMatricola(matricola),
        via,
        civico,
        comune: String(r.comune ?? '').trim() || null,
        cap: String(r.cap ?? '').trim() || null,
        impianto: String(r.impianto ?? '').trim() || null,
        nominativo: String(r.nominativo ?? '').trim() || null,
        recapito: String(r.recapito ?? '').trim() || null,
        master_riga_id: r.id,
      });
    }
  }

  return { nuovi, correzioni, giaPresenti, scartate };
}
