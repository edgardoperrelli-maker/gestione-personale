// utils/rapportini/datiRiepilogoPdf.ts
import { riepilogoRapportino, statoVoceEffettivo } from './riepilogo';
import { resolveInfoCampi, valoreInfo, type InfoChiave, type VoceInfo, type TemplateInfoCampo } from './infoCampi';
import { campiDiVoce } from './campiDiVoce';
import { campiEsportabili, type TemplateCampo } from './buildVoci';
import { isCampoNota } from './voceMancante';
import { isEsitoSelect, isNomeNegativo } from './voceColore';
import { esitoPositivoDefault } from '@/lib/interventi/manuali/esitoPositivoDefault';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';

export interface VoceRiepilogo extends VoceInfo {
  risposte: Record<string, unknown>;
  /** Voce creata dal "+": è sempre completa (come nel riepilogo/lista) → va in "Eseguiti". */
  manuale?: boolean;
  /** Stato approvazione ufficio: le voci `rifiutato` sono scartate dal PDF e dai conteggi. */
  approvazione_stato?: string | null;
  /** Campi del flusso della voce (gruppo attività). Assenti/vuoti = eredita quelli del rapportino. */
  campi?: TemplateCampo[] | null;
}

/** Colonna del PDF: campo anagrafico (info_snapshot) o campo compilabile (campi_snapshot). */
export interface ColonnaPdf {
  etichetta: string;
  /** true se è una crocetta del template → cella stretta e centrata ("X"). */
  crocetta: boolean;
  /** Chiave anagrafica, se la colonna viene da `info_snapshot`. Serve al livello CAMPO del PDF
   *  per pescare ODS/ODL, matricola, PDR e indirizzo per NOME invece che per posizione: le
   *  colonne sono dinamiche per template, e indicizzarle a mano è come contare le dita. */
  info?: InfoChiave;
  /** Chiave del campo template, se la colonna è un campo compilabile. */
  campo?: string;
  /** Campo NOTE: il livello CAMPO lo stampa come riga a tutta larghezza sotto l'intervento,
   *  non come colonna (in colonna la nota mandava a capo la riga e sfalsava la griglia). */
  nota?: boolean;
  /** Campo ESITO (o marcatore negativo): non è una lavorazione prodotta. */
  esito?: boolean;
  /** Lunghezza massima del valore renderizzato su TUTTE le righe. 0 = colonna vuota ovunque,
   *  che il livello UFFICIO pota per restituire larghezza agli indirizzi. */
  maxLen?: number;
}

export interface RigaPdf {
  n: number;
  /** Valori allineati per indice a DatiRiepilogoPdf.colonne. */
  valori: string[];
  /** Note della voce, unite da " · ". Assente = nessuna riga nota da stampare. */
  nota?: string;
}

export interface DatiRiepilogoPdf {
  staffName: string;
  dataLabel: string;
  stats: { totali: number; eseguiti: number; nonEseguiti: number };
  lavorazioni: { etichetta: string; count: number }[];
  /** Quantità di produzione per ATTIVITÀ. Serve perché su alcuni flussi (es. SOSTITUZIONE
   *  MISURATORE di AcquaLatina) il template non ha nessuna crocetta: `lavorazioni` resta vuoto
   *  e il rapportino più pieno della giornata mostrerebbe zero produzione. La somma dei count
   *  è sempre `stats.totali`: le voci senza attività finiscono nel bucket "SENZA ATTIVITÀ". */
  attivita?: { etichetta: string; count: number }[];
  /** Committenti degli interventi della giornata, già in forma leggibile. Più di uno sui giri
   *  misti; vuoto se non ricavabile → l'intestazione salta la riga. */
  committenti?: string[];
  /** Colonne dinamiche: anagrafica (da info_snapshot) + campi compilabili (da campi_snapshot). */
  colonne: ColonnaPdf[];
  eseguiti: RigaPdf[];
  nonEseguiti: RigaPdf[];
  /** Interventi ancora SENZA esito (non compilati, o template senza campo `eseguito`): NON vanno
   * scartati dal PDF, altrimenti il corpo resta vuoto pur con interventi pianificati. */
  daFare: RigaPdf[];
}

/** Valori di un select che indicano "non fatto" (allineato a voceColore, incl. "NESSUN PASSAGGIO"). */
const NEG_SELECT = /^(no|assente|negativ\w*|ko|nessun[\s_-]*passagg\w*)$/i;

/**
 * Il campo NON è una lavorazione prodotta: o è l'ESITO della voce, o è un marcatore negativo
 * («Cliente assente», «Non eseguito»). Contarlo gonfiava il blocco produzione con una riga
 * «ESEGUITO N» sempre uguale al riquadro ESEGUITI — informazione duplicata, zero contenuto.
 *
 * Riusa le due funzioni di `voceColore` invece di una regex propria: il PDF ne aveva una più
 * stretta (solo /assent/i) che lasciava passare i campi chiamati «NON ESEGUITO» o «NEGATIVO».
 * Il vincolo `tipo === 'select'` su `isEsitoSelect` replica come lo usa voceColore stesso
 * (lì è sempre dentro il ramo select): su una crocetta decide il nome negativo.
 */
function isCampoEsito(c: TemplateCampo): boolean {
  if (c.tipo === 'select' && isEsitoSelect(c)) return true;
  return isNomeNegativo(c);
}

/**
 * La lavorazione di un campo è "svolta" su una voce?
 * - crocetta: spuntata (true)
 * - select: valorizzata e non negativa (es. "SI") — copre la saracinesca dei template ACEA
 */
function lavorazioneFatta(campo: TemplateCampo, valore: unknown): boolean {
  // Booleano true = crocetta spuntata. Le voci manuali dal "+" salvano la lavorazione come
  // `true` anche se nel template pianificato lo stesso campo è dichiarato 'select': conta lo stesso.
  if (valore === true) return true;
  if (campo.tipo === 'select') {
    const s = typeof valore === 'string' ? valore.trim() : '';
    return s !== '' && !NEG_SELECT.test(s);
  }
  return false;
}

/** Valore di un campo compilabile del template per una voce, formattato per la cella. */
export function valoreCampo(risposte: Record<string, unknown>, campo: TemplateCampo): string {
  const v = risposte?.[campo.chiave];
  // "Fatto" uniforme → "X": crocetta `true` (voci manuali) E select affermativo "SI"/"Sì"
  // (voci pianificate). Così la stessa lavorazione (es. Sostituzione valvola) si legge sempre "X".
  // I valori negativi ("NO") e gli altri testi restano invariati.
  if (v === true || (typeof v === 'string' && /^s[iì]$/i.test(v.trim()))) return 'X';
  if (v === false || v == null) return '';
  if (campo.tipo === 'crocetta') return '';
  return String(v).trim();
}

export function costruisciDatiPdf(params: {
  staffName: string;
  dataLabel: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi?: TemplateInfoCampo[] | null;
  /** Template task-via (es. BONIFICHE EXTRA): le voci pianificate sono "contenitori" (le vie); il
   * dettaglio sono gli ordini creati col "+" (manuale=true). Il PDF mostra gli ordini, non i contenitori. */
  taskVia?: boolean;
  /** Legacy/UI: il flag ibrido del template. NON più necessario qui — i contenitori BONIFICHE EXTRA
   * vengono scartati in base all'ATTIVITÀ a prescindere dal flag (coerente con il form). Mantenuto
   * nella firma per retro-compatibilità dei chiamanti. */
  taskViaIbrido?: boolean;
  /** Committenti già in forma leggibile, calcolati a monte (server). Qui è solo un passacarte:
   *  nessuna euristica, perché indovinare il committente dai dati della voce è come indovinare
   *  il proprietario di una casa dal colore della porta. */
  committenti?: string[];
}): DatiRiepilogoPdf {
  const { staffName, dataLabel, voci: vociInput, campi, infoCampi, taskVia, committenti } = params;
  // Le voci RIFIUTATE dall'ufficio sono scartate dal PDF: non sono interventi validi → fuori da
  // stats, lavorazioni e liste (coerente con `riepilogoRapportino`). Tutto il resto usa `voci`.
  let voci = vociInput.filter((v) => v.approvazione_stato !== 'rifiutato');
  // Task-via: scarta i contenitori (voci pianificate, manuale=false) e tiene solo gli ordini "+"
  // (manuale=true), che sono il vero dettaglio del lavoro. Senza questo il PDF mostrerebbe le vie
  // contenitore vuote invece degli interventi creati al loro interno.
  if (taskVia) {
    // Guardia anti-PDF-vuoto: tieni solo gli ordini "+" SOLO se ce ne sono davvero. Se un template
    // task-via viene usato per interventi normali (nessun ordine, tutte le voci manuale=false — es.
    // un template classico flaggato task-via per errore), NON svuotare il PDF: mostra le voci così.
    const ordini = voci.filter((v) => v.manuale === true);
    if (ordini.length > 0) voci = ordini;
  } else {
    // Fuori dal task-via puro: scarta i contenitori BONIFICHE EXTRA (voci pianificate con quell'attività,
    // manuale=false). Le voci classiche e gli ordini "+" restano. L'attività BONIFICHE EXTRA è di per sé
    // il segnale di contenitore, quindi vale a prescindere dal flag `task_via_ibrido` del template —
    // coerente con il form (la voce apre il contenitore e non ha esito proprio). Gli ordini figli sono
    // già esclusi a monte (parent_voce_id). Stessa guardia anti-PDF-vuoto del task-via puro: se dopo lo
    // scarto non resta nulla (rapportino di soli contenitori senza ordini), NON svuotare il PDF.
    const senzaContenitori = voci.filter((v) => !(isTaskVia(v) && v.manuale !== true));
    if (senzaContenitori.length > 0) voci = senzaContenitori;
  }
  const riep = riepilogoRapportino(voci, campi);

  // Stesse colonne del rapportino digitale/Excel:
  // anagrafica scelta nel template (info_snapshot) + campi compilabili (campi_snapshot).
  const info = resolveInfoCampi(infoCampi);
  const campiOrd = campiEsportabili(campi).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const colonne: ColonnaPdf[] = [
    ...info.map((c) => ({ etichetta: c.etichetta, crocetta: false, info: c.chiave })),
    ...campiOrd.map((c) => ({
      etichetta: c.etichetta,
      crocetta: c.tipo === 'crocetta',
      campo: c.chiave,
      nota: isCampoNota(c),
      esito: isCampoEsito(c),
    })),
  ];
  // I campi nota restano una COLONNA del contratto dati (l'ufficio la vuole in tabella, e
  // l'allineamento per indice fra `colonne` e `RigaPdf.valori` è ciò su cui poggiano i test):
  // è il renderer del livello CAMPO a stamparli come riga a tutta larghezza.
  const campiNota = campiOrd.filter(isCampoNota);

  // Blindatura del campo esecutivo "eseguito" per le voci manuali (dal "+"): una voce manuale è
  // SEMPRE a esito positivo (vedi `riepilogoRapportino` e lo `stato` qui sotto). Se però il campo
  // `eseguito` non è stato salvato — es. il template solo_manuale del committente non lo dichiara,
  // quindi `esitoPositivoDefault` a creazione è un no-op — la barra "Eseguito" e la cella restavano
  // vuote pur essendo la voce conteggiata negli ESEGUITI (regressione PLENZICH: 45 vs 32). Qui in
  // lettura riapplichiamo l'UNICA fonte di verità `esitoPositivoDefault` (i `campi` del rapportino
  // dichiarano `eseguito`), così barra e cella restano allineate ai totali a prescindere dai dati
  // salvati. Le voci pianificate restano intatte (un "NO" legittimo non viene toccato).
  // L'esito si valuta sui campi DELLA voce (flusso del suo gruppo attività), non su quelli del
  // rapportino: è la stessa fonte di verità di `riepilogoRapportino`, della lista e del form.
  // Valutarlo sui campi del rapportino faceva finire in «Da eseguire» voci che l'header contava
  // come ESEGUITI — bastava un obbligo (es. `matricola_nuova`) presente nel template del
  // rapportino ma non nel flusso della voce (rapportino TODINI 04/08: 16 ESEGUITI vs sezione
  // «Da eseguire (16)»).
  const campiVoce = voci.map((v) => campiDiVoce(v, campi));

  const risposteVoce = voci.map((v, i) =>
    v.manuale ? esitoPositivoDefault(campiVoce[i], v.risposte ?? {}) : (v.risposte ?? {}),
  );

  // Una lavorazione si conta SOLO sugli interventi ESEGUITI: un'azione (es. mini_bag) marcata su
  // una voce NON eseguita non è una "lavorazione svolta" e gonfiava il conteggio oltre il numero
  // di eseguiti (caso DELL'AQUILA: mini_bag > eseguiti). Le voci manuali (dal "+") sono sempre eseguite.
  const vociEseguite = voci.map(
    (v, i) => statoVoceEffettivo({ risposte: risposteVoce[i], manuale: v.manuale }, campiVoce[i]) === 'eseguito',
  );

  // Quantità di produzione per ATTIVITÀ, sulle STESSE voci già filtrate qui sopra (rifiutate e
  // contenitori task-via esclusi): così la somma dei gruppi è sempre `stats.totali`. La chiave di
  // raggruppamento passa da `normalizzaAttivita` — maiuscolo, senza accenti, spazi collassati —
  // altrimenti «Riattivazione fornitura» e «RIATTIVAZIONE FORNITURA» diventano due voci distinte.
  // Il bucket del vuoto è esplicito: `rapportino_voci.attivita` è nullable e senza bucket quelle
  // voci sparirebbero dal conteggio senza che nessuno se ne accorga.
  const gruppiAttivita = new Map<string, { etichetta: string; count: number }>();
  for (const v of voci) {
    const norm = normalizzaAttivita(v.attivita);
    const chiave = norm?.key ?? '';
    const g = gruppiAttivita.get(chiave);
    if (g) g.count += 1;
    else gruppiAttivita.set(chiave, { etichetta: norm?.etichetta ?? 'SENZA ATTIVITÀ', count: 1 });
  }
  const attivita = [...gruppiAttivita.values()].sort(
    (a, b) => b.count - a.count || a.etichetta.localeCompare(b.etichetta, 'it'),
  );

  // Barre "Lavorazioni svolte": crocette spuntate + select positivi (es. saracinesca "SI"),
  // escludendo esiti e marcatori negativi e contando solo sugli interventi eseguiti.
  const lavorazioni = campiOrd
    .filter((c) => (c.tipo === 'crocetta' || c.tipo === 'select') && !isCampoEsito(c))
    .map((c) => ({
      etichetta: c.etichetta,
      count: risposteVoce.filter((r, i) => vociEseguite[i] && lavorazioneFatta(c, r[c.chiave])).length,
    }))
    .filter((l) => l.count > 0);

  const eseguiti: RigaPdf[] = [];
  const nonEseguiti: RigaPdf[] = [];
  const daFare: RigaPdf[] = [];

  voci.forEach((v, i) => {
    const rsp = risposteVoce[i];
    const valori = [
      ...info.map((c) => valoreInfo(v, c.chiave)),
      ...campiOrd.map((c) => valoreCampo(rsp, c)),
    ];
    // Le note viaggiano anche fuori dalle colonne: il livello CAMPO le stampa a tutta larghezza
    // sotto l'intervento. Più campi nota nello stesso template si uniscono con " · ".
    const nota = campiNota
      .map((c) => (typeof rsp[c.chiave] === 'string' ? String(rsp[c.chiave]).trim() : ''))
      .filter(Boolean)
      .join(' · ');
    const riga: RigaPdf = nota ? { n: i + 1, valori, nota } : { n: i + 1, valori };
    // Stessa regola di riepilogo e lista: una voce dal "+" senza esito dichiarato è "Eseguiti"
    // (le sue chiavi sono quelle del template manuale, non del pianificato: senza la scorciatoia
    // dava 'da_fare' e la riga spariva dal PDF pur essendo conteggiata nei totali), ma un esito
    // dichiarato — anche negativo — vince sempre.
    const stato = statoVoceEffettivo({ risposte: rsp, manuale: v.manuale }, campiVoce[i]);
    if (stato === 'eseguito') eseguiti.push(riga);
    else if (stato === 'non_eseguito') nonEseguiti.push(riga);
    // 'da_fare' (non compilata, o template senza campo `eseguito` es. BONIFICHE EXTRA): NON scartare.
    // Va mostrata col suo indirizzo/attività, altrimenti un rapportino non (del tutto) compilato
    // genera un PDF con corpo vuoto pur avendo N interventi nell'header (regressione segnalata).
    else daFare.push(riga);
  });

  // Larghezza reale di ogni colonna, misurata sui valori DAVVERO renderizzati (`valoreCampo` dà
  // già '' per crocette non spuntate e per i null). maxLen === 0 significa colonna vuota su tutte
  // le righe: nel PDF di GIOSI del 07/08 erano 5 colonne su 17 — 65 mm rubati agli indirizzi, che
  // per starci venivano spezzati a metà parola («VIA FRAN CESCO D OMENICO GUERRA ZZI»).
  const tutteLeRighe = [...eseguiti, ...nonEseguiti, ...daFare];
  colonne.forEach((c, k) => {
    c.maxLen = tutteLeRighe.reduce((m, r) => Math.max(m, (r.valori[k] ?? '').length), 0);
  });

  return {
    staffName,
    dataLabel,
    stats: { totali: riep.totali, eseguiti: riep.eseguiti, nonEseguiti: riep.nonEseguiti },
    lavorazioni,
    attivita,
    committenti: committenti ?? [],
    colonne,
    eseguiti,
    nonEseguiti,
    daFare,
  };
}
