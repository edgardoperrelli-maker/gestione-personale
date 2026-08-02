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
// Additivo per costruzione: la funzione restituisce solo le righe NUOVE. Le presenti non si
// toccano mai — lì sopra vive la pianificazione dell'ufficio.

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
  /** L'anagrafica che la riga ha GIÀ: decide se c'è un vuoto da riempire. */
  impianto?: string | null;
  nominativo?: string | null;
  recapito?: string | null;
};

/** I tre campi che un master può riempire su una riga già a registro. */
export type CampoAnagrafica = 'impianto' | 'nominativo' | 'recapito';
const CAMPI_ANAGRAFICA: readonly CampoAnagrafica[] = ['impianto', 'nominativo', 'recapito'];

/** Una riga già a registro a cui il master aggiunge un dato che le mancava. */
export type Arricchimento = {
  odl: string;
  numero_operazione: string;
  patch: Partial<Record<CampoAnagrafica, string>>;
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
   * Righe già a registro a cui il master aggiunge un dato che mancava.
   *
   * «Additivo» ha sempre voluto dire «non tocco le righe presenti», ed è la regola che protegge
   * la pianificazione. Ma vale per i dati che la riga HA: su un campo VUOTO non c'è niente da
   * proteggere, e la regola stretta trasformava il ricaricamento del master — il gesto normale
   * quando il file arriva più completo — in un'operazione che non serviva a niente. È successo:
   * le 4.196 righe di luglio sono entrate senza cod. fornitura, e il sync non aveva modo di
   * portarglielo. Si riempie SOLO il vuoto: un dato corretto in ufficio non si sovrascrive mai.
   */
  arricchimenti: Arricchimento[];
  /** Coppie (ODL, matricola) già a registro: la misura dell'idempotenza. */
  giaPresenti: number;
  /** Righe del master inutilizzabili (senza ODL o matricola) o duplicate nel file stesso. */
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

/**
 * Le righe NUOVE da inserire a registro (con il loro numero operazione) e i VUOTI che il master
 * può riempire su quelle già presenti.
 *
 * Regole di numerazione, nell'ordine:
 *  - le righe esistenti dello stesso ODL riservano i loro numeri: MAI rinumerare — la chiave
 *    `odl|numero_operazione` è in giro (selezioni, appunti, log operazioni);
 *  - le matricole nuove si ordinano alfabeticamente (normalizzate) e prendono i numeri liberi a
 *    salire dal massimo esistente: due sync con lo stesso file producono le stesse chiavi.
 *
 * Gli arricchimenti sono l'unica cosa che tocca una riga presente, e toccano SOLO i suoi campi
 * vuoti: la pianificazione, le note, gli stati restano intatti — rieseguire il sync sullo stesso
 * file produce zero arricchimenti al secondo giro.
 */
export function ordiniDaMaster(
  righe: readonly RigaMaster[],
  esistenti: readonly OrdineEsistente[],
): EsitoSync {
  // Cosa c'è già, per ODL: le matricole presenti e il numero più alto assegnato.
  const perOdl = new Map<string, { matricole: Set<string>; maxNumero: number }>();
  // La riga presente, per coppia (ODL, matricola): serve a vedere quali campi le mancano.
  const perChiave = new Map<string, OrdineEsistente>();
  for (const e of esistenti) {
    const odl = e.odl.trim();
    if (odl === '') continue;
    const v = perOdl.get(odl) ?? { matricole: new Set<string>(), maxNumero: 0 };
    const m = normMatricola(e.matricola);
    if (m !== '') {
      v.matricole.add(m);
      perChiave.set(`${odl}#${m}`, e);
    }
    const n = Number.parseInt(e.numero_operazione, 10);
    if (Number.isFinite(n) && n > v.maxNumero) v.maxNumero = n;
    perOdl.set(odl, v);
  }

  // Le candidate valide e non ancora presenti, deduplicate anche DENTRO il file.
  const candidate = new Map<string, RigaMaster[]>();
  const arricchimenti: Arricchimento[] = [];
  let giaPresenti = 0;
  let scartate = 0;
  const vistoNelFile = new Set<string>();
  for (const r of righe) {
    const odl = String(r.odl ?? '').trim();
    const matricola = String(r.matricola ?? '').trim();
    const norm = normMatricola(matricola);
    if (odl === '' || norm === '') {
      scartate++;
      continue;
    }
    const chiave = `${odl}#${norm}`;
    if (vistoNelFile.has(chiave)) {
      scartate++;
      continue;
    }
    vistoNelFile.add(chiave);
    if (perOdl.get(odl)?.matricole.has(norm)) {
      giaPresenti++;
      const presente = perChiave.get(chiave);
      if (presente) {
        const patch: Partial<Record<CampoAnagrafica, string>> = {};
        for (const campo of CAMPI_ANAGRAFICA) {
          const dalFile = String(r[campo] ?? '').trim();
          if (dalFile !== '' && String(presente[campo] ?? '').trim() === '') patch[campo] = dalFile;
        }
        if (Object.keys(patch).length > 0) {
          arricchimenti.push({ odl, numero_operazione: presente.numero_operazione, patch });
        }
      }
      continue;
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

  return { nuovi, arricchimenti, giaPresenti, scartate };
}
