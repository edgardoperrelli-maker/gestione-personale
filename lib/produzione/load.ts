import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { esitoOkDaIntervento } from '@/lib/limitazione/exportLimMassive';
import { voceDaAttivita } from './voceDaAttivita';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';
import { attivitaCanonica } from './attivitaCanonica';
import { interventiConSaracinescaDichiarata } from '@/lib/acea/caricaSaracinesche';
import { scostamentoPagato } from './statoPortale';
import { caricaAliasAttivita } from './aliasAttivita';
import { caricaComuniMassive } from './comuniMassive';
import { caricaOrdiniSostituzione } from '@/lib/acea/caricaSaracinesche';
import { chiaviAggancio } from '@/lib/acea/saracinesche';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';
import { aggregaProduzione, deduplicaMassivePerMatricola, type Aggregato, type ProduzioneAggregata, type RigaProduzione } from './aggregaProduzione';
import { aggregaPersonale, giornoSettimana, type ProduzionePersonale, type RigaLavoro } from './aggregaPersonale';
import { aggregaEsiti, type EsitoOperatore, type RigaEsito } from './aggregaEsiti';
import {
  riconcilia,
  scartoProduzioneSal,
  type ClasseDiscrepanza,
  type Discrepanza,
  type DbRiga,
  type RegistroRiga,
  type PortaleRiga,
  type Totale,
} from './riconciliazione';
import { odlPagatiDaSal, riepilogoUnSal, type SalRigaArricchita, type SalStorico } from './salUfficiale';
import { confrontaSalProduzione, type ConfrontoSal, type SalRigaConfronto } from './confrontoSal';
import { PREFISSO_COMMESSA } from './composizioneVoce';
import {
  COMMESSE,
  commessaDi,
  committentiGrezzi,
  inVista,
  type Commessa,
  type VistaCommittente,
} from './committente';

// Loader server-only della "Produzione economica". Riusa la logica pura testata.
// Condiviso tra l'endpoint dati (tab) e l'export Excel (così non si duplica il calcolo).

const PAGE = 1000;
const VOCI_VALIDE = new Set([10, 11, 12, 6]);
const KPI_DA_VOCE: Record<number, string> = { 10: 'EL', 11: 'ES', 12: 'ERC', 6: 'ERA' };
const AUDIT_CAP = 500;
const SARA_KEY = 'SOSTITUZIONE SARACINESCA';
const SARA_LABEL = 'Sostituzione saracinesca';

/** Voce affidabile: usa interventi.voce solo se valida, altrimenti la deriva dal testo attività. */
function risolviVoce(voceRaw: number | null, attivita: string | null): number | null {
  if (voceRaw != null && VOCI_VALIDE.has(voceRaw)) return voceRaw;
  return voceDaAttivita(attivita);
}

/*
  Il gruppo con cui la riga entra nel donut «produzione per voce».

  Per ACEA è il codice di fatturazione (EL/ES/ERC/ERA), e `null` quando non si riesce a dedurlo —
  che è un problema vero, da vedere. Per le altre commesse la voce NON ESISTE: il gruppo è la
  commessa stessa, così la loro produzione ha una fetta sua invece di finire in «Non classificata»,
  dove sembrerebbe lavoro da sistemare e non lavoro di un altro committente.
*/
function gruppoVoce(commessa: Commessa, voce: number | null): string | null {
  if (commessa !== 'acea') return `${PREFISSO_COMMESSA}${commessa}`;
  return voce != null ? KPI_DA_VOCE[voce] ?? null : null;
}

export interface ProduzioneSal {
  totale: Totale;
  perVoce: { chiave: string; label: string; conteggio: number; valore: number }[];
  perGiorno: { chiave: string; label: string; conteggio: number; valore: number }[];
}

export interface ProduzioneEconomica {
  from: string;
  to: string;
  /** La vista con cui è stato calcolato: il payload dice di chi parla, non lo si deduce. */
  vista: VistaCommittente;
  /**
   * SAL, pre-SAL, scarto, fuori-SAL e audit sono calcolati sulla sola fetta ACEA (l'unica con
   * un portale). `false` quando la vista è AcquaLatina: là quei campi sono zeri, non «zero euro
   * consuntivati».
   */
  conContabilizzazione: boolean;
  listino: ListinoRiga[];
  produzione: ProduzioneAggregata;
  /**
   * La sola quota ACEA della produzione: è l'unica confrontabile col SAL e con il portale.
   * Nella vista ACEA coincide con `produzione`; in «Tutti» ne è la parte senza AcquaLatina.
   */
  produzioneAcea: { totale: Totale; perGiorno: Aggregato[] };
  sal: ProduzioneSal;
  scarto: Totale;
  salStorico: SalStorico[];
  /**
   * Confronto fra un SAL scelto e la produzione del periodo. `null` quando nessun SAL è
   * selezionato — è una verifica che si chiede, non un blocco sempre acceso: calcolarla
   * d'ufficio vorrebbe dire scegliere noi quale SAL confrontare, e la scelta è il punto.
   */
  confrontoSal: ConfrontoSal | null;
  preSal: { n: number; totale: Totale };
  fuoriSal: Totale;
  personale: ProduzionePersonale;
  esiti: EsitoOperatore[];
  audit: Discrepanza[];
  auditSummary: Record<ClasseDiscrepanza, number>;
  auditTotale: number;
  auditTruncated: boolean;
  registroPopolato: boolean;
  portalePopolato: boolean;
}

interface InterventoRow {
  id: string;
  odl: string | null;
  data: string | null;
  staff_id: string | null;
  territorio_id: string | null;
  voce: number | null;
  intervento_tipo: string | null;
  esito: string | null;
  stato: string | null;
  committente: string | null;
  comune: string | null;
  matricola_contatore: string | null;
}
/*
  La colonna di mezzo dell'audit: il REGISTRO del modulo ACEA, non più la fotografia dei file
  SharePoint (`acea_master_snapshot`). Dice le stesse cose — quali ordini esistono, con che
  attività — ma si aggiorna con l'import del Cruscotto invece che con un agente su un PC acceso.

  Il registro NON ha una colonna `voce`: la si deriva dall'attività, che è ciò che
  `risolviVoce(null, …)` fa già per gli interventi senza voce valida.
*/
interface RegistroRow {
  odl: string;
  attivita: string | null;
  comune: string | null;
}
interface PortaleRow {
  odl: string;
  stato_norm: string | null;
  causa_scostamento: string | null;
}
interface SalRow {
  sal_n: number;
  odl: string;
  doc_acquisti: string;
  posizione: string;
  valore: number;
  causa: string | null;
  attivita: string | null;
  data_completamento: string | null;
  data_registrazione: string | null;
}
interface LavoroRow {
  staff_id: string | null;
  data: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  comune: string | null;
}

async function caricaInterventi(vista: VistaCommittente): Promise<InterventoRow[]> {
  const rows: InterventoRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, staff_id, territorio_id, voce, intervento_tipo, esito, stato, committente, comune, matricola_contatore')
      .in('committente', committentiGrezzi(vista))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as InterventoRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function caricaSnapshot<T>(tabella: string, colonne: string): Promise<T[]> {
  const rows: T[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(tabella)
      .select(colonne)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/** Giorno successivo di 'YYYY-MM-DD' (bound esclusivo per query robuste a date/timestamp). */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Interventi LAVORATI (stato='completato', qualsiasi committente) nel range: è il DENOMINATORE
// delle giornate-uomo frazionarie (un operatore "doppio territorio" che fa ACEA a saturazione
// non conta una giornata intera sulla commessa).
async function caricaLavoroGiornaliero(from: string, to: string): Promise<LavoroRow[]> {
  const rows: LavoroRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('staff_id, data, committente, intervento_tipo, comune')
      .eq('stato', 'completato')
      .gte('data', from)
      .lt('data', giornoDopo(to))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as LavoroRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function nomi(): Promise<{ staff: Map<string, string>; terr: Map<string, string> }> {
  const [{ data: s }, { data: t }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, display_name'),
    supabaseAdmin.from('territories').select('id, name'),
  ]);
  const staff = new Map<string, string>();
  for (const r of (s ?? []) as Array<{ id: string; display_name: string | null }>) {
    staff.set(r.id, (r.display_name ?? '').trim() || 'Operatore');
  }
  const terr = new Map<string, string>();
  for (const r of (t ?? []) as Array<{ id: string; name: string | null }>) {
    terr.set(r.id, (r.name ?? '').trim() || 'Territorio');
  }
  return { staff, terr };
}

export async function caricaProduzioneEconomica(
  from: string,
  to: string,
  vista: VistaCommittente = 'tutti',
  /** Numero del SAL da mettere a confronto con la produzione del periodo; null = nessun confronto. */
  salSelezionato: number | null = null,
): Promise<ProduzioneEconomica> {
  /*
    La fetta ACEA c'è in «ACEA» e in «Tutti», non in «AcquaLatina». Comanda tutto ciò che nasce
    dal portale SAP e dai SAL ufficiali: senza di lei quei giri si saltano interi, invece di
    girare a vuoto e restituire zeri che poi qualcuno legge come «non ci hanno pagato niente».
  */
  const conAcea = inVista(vista, 'acea');

  const [listinoRows, interventi, registroRows, portaleRows, maps, alias, lavoroRows, salRows, comuniMassive, idSaracinesca, ordiniSostituzione] = await Promise.all([
    /*
      Il listino di TUTTE le commesse in vista, tenuto separato per committente e non appiattito
      in un array unico: `prezzoPerData` sceglie per (attività, data), e due committenti che un
      giorno chiamassero allo stesso modo la stessa attività — «RIMOZIONE CONTATORE» — si
      ruberebbero la tariffa a vicenda, in silenzio e in modo pure deterministico.
    */
    supabaseAdmin
      .from('listino')
      .select('id, attivita, prezzo, valido_dal, valido_al, attivo, committente')
      .in('committente', [...COMMESSE]),
    caricaInterventi(vista),
    caricaSnapshot<RegistroRow>('acea_ordini', 'odl, attivita, comune'),
    caricaSnapshot<PortaleRow>('acea_portale_snapshot', 'odl, stato_norm, causa_scostamento'),
    nomi(),
    caricaAliasAttivita(),
    caricaLavoroGiornaliero(from, to),
    caricaSnapshot<SalRow>('acea_sal', 'sal_n, odl, doc_acquisti, posizione, valore, causa, attivita, data_completamento, data_registrazione'),
    caricaComuniMassive(),
    /*
      Le saracinesche dichiarate, per INTERVENTO. Prima venivano dalla colonna `saracinesca` del
      master, e il modulo ACEA aveva già smesso di fidarsene: «è la fotografia del vecchio foglio
      compilato a mano, e non concorda» (caricaSaracinesche.ts). Il motore KPI era l'ultimo posto
      a usarla. Per intervento e non per ODL: le massive nate senza ordine ACEA — 834 positivi —
      un ODL non ce l'hanno, e fermarsi lì le cancellerebbe dai conti.
    */
    interventiConSaracinescaDichiarata(supabaseAdmin),
    /*
      Gli ordini ACEA di sostituzione saracinesca, dal registro. Servono a sapere se la
      saracinesca che abbiamo prodotto è stata poi CONSUNTIVATA: sul portale non compare sotto
      l'ODL della limitazione ma sotto un ordine figlio suo.

      Quel legame stava in una colonna del master compilata a mano (`odl_saracinesca`). Qui si
      deriva per impianto o matricola, che è come il modulo ACEA lo deriva già nella sua vista
      Saracinesche — e ha il pregio di funzionare anche sugli ordini che nessuno ha annotato.
    */
    caricaOrdiniSostituzione(supabaseAdmin),
  ]);
  const saracinescaDichiarata = new Set(idSaracinesca);

  // chiave d'aggancio (impianto o matricola) → ODL dell'ordine figlio di sostituzione.
  const figlioPerChiave = new Map<string, string>();
  for (const o of ordiniSostituzione) {
    for (const k of chiaviAggancio(o)) if (!figlioPerChiave.has(k)) figlioPerChiave.set(k, o.odl);
  }

  const listino: ListinoRiga[] = [];
  const listinoPerCommessa = new Map<Commessa, ListinoRiga[]>();
  for (const r of (listinoRows.data ?? []) as Array<{
    id: string;
    attivita: string | null;
    prezzo: number;
    valido_dal: string;
    valido_al: string | null;
    attivo: boolean;
    committente: string | null;
  }>) {
    const commessa = commessaDi(r.committente);
    if (!r.attivita || commessa == null) continue;
    const riga: ListinoRiga = {
      id: r.id,
      attivita: r.attivita,
      prezzo: Number(r.prezzo),
      valido_dal: r.valido_dal,
      valido_al: r.valido_al,
      attivo: r.attivo,
    };
    listino.push(riga);
    const perC = listinoPerCommessa.get(commessa);
    if (perC) perC.push(riga);
    else listinoPerCommessa.set(commessa, [riga]);
  }

  /**
   * Tariffa di una riga. La commessa è il primo argomento e non un dettaglio: è ciò che impedisce
   * a una sostituzione AcquaLatina di prendere il prezzo di un'attività ACEA omonima.
   */
  const valore = (commessa: Commessa, attivitaKey: string, data: string): number => {
    if (!attivitaKey) return 0;
    const sel = prezzoPerData(listinoPerCommessa.get(commessa) ?? [], attivitaKey, data);
    return sel ? valoreRiga(sel.prezzo) : 0;
  };

  // DB per ODL: audit (vince il positivo) + info per attribuire la saracinesca al giusto operatore/giorno.
  const dbAudit = new Map<string, DbRiga>();
  const dbDataByOdl = new Map<string, string>();
  const dbAttivita = new Map<string, string>(); // odl → attività (per valorizzare il SAL)
  const dbInfo = new Map<string, { staffId: string; operatore: string; territorioId: string; territorio: string; data: string }>();
  const effByOdl = new Map<string, string>(); // odl → committente EFFETTIVO (per escludere il gas dal SAL)
  /*
    Le due popolazioni di ODL che servono al confronto col SAL, e che NON coincidono con `dbAudit`:
    - `odlNotiDb`: ogni ODL che compare nei nostri interventi, anche riclassificato a italgas e
      anche fuori vista. Distingue «ACEA ci ha pagato un ordine che non abbiamo mai visto» da
      «ce l'abbiamo, ma non a positivo»: due problemi diversi, con due rimedi diversi.
    - `odlPositiviAcea`: positivi ACEA in QUALSIASI data. Un ODL del SAL che è nostro e positivo
      ma lavorato prima del periodo a schermo non è un buco: è solo fuori finestra.
  */
  const odlNotiDb = new Set<string>();
  const odlPositiviAcea = new Set<string>();
  const righeEsito: RigaEsito[] = [];
  const produzioneRighe: RigaProduzione[] = [];
  for (const it of interventi) {
    const odl = (it.odl ?? '').trim();
    // attività CANONICA via alias (+ regole comune per le righe senza attività) → committente effettivo,
    // attività pulita e voce. La riclassificazione (gas→italgas, massive→acea) vive qui, non nel DB.
    const canon = attivitaCanonica(it.committente, it.intervento_tipo, it.comune, alias, comuniMassive);
    if (odl && canon) effByOdl.set(odl, canon.committenteEff);
    if (odl) odlNotiDb.add(odl);
    // Nella vista: committente effettivo tra le commesse chieste, e attività non scartata.
    if (!canon || !canon.attivo || !inVista(vista, canon.committenteEff)) continue;
    const commessa = commessaDi(canon.committenteEff) as Commessa; // garantito da inVista
    const voce = canon.voce;
    const attivitaKey = canon.attivitaKey;
    const esitoOk = esitoOkDaIntervento(it.stato, it.esito);
    const data = (it.data ?? '').slice(0, 10);
    const staffId = it.staff_id ?? '';
    const operatore = (it.staff_id && maps.staff.get(it.staff_id)) || 'Sconosciuto';
    const territorioId = it.territorio_id ?? '';
    const territorio = (it.territorio_id && maps.terr.get(it.territorio_id)) || 'Senza territorio';
    /*
      Solo ACEA entra nell'audit. L'audit confronta i nostri ODL con il registro `acea_ordini` e
      col portale SAP: un ordine AcquaLatina, che in nessuno dei due c'è mai stato, uscirebbe
      classificato «nel DB ma non nel registro» — trecento discrepanze inventate a ogni apertura
      della vista «Tutti», e le poche vere sepolte in mezzo.
    */
    if (odl && commessa === 'acea') {
      if (esitoOk === true) odlPositiviAcea.add(odl);
      const prev = dbAudit.get(odl);
      if (!prev || (esitoOk === true && prev.esitoOk !== true)) {
        dbAudit.set(odl, { voce, esitoOk });
        if (data) dbDataByOdl.set(odl, data);
        if (attivitaKey) dbAttivita.set(odl, attivitaKey);
        dbInfo.set(odl, { staffId, operatore, territorioId, territorio, data });
      }
    }
    // Esiti sull'assegnato (design 2026-07-02): ogni riga in vista con operatore nel range,
    // qualsiasi esito (anche mai lavorata). Niente dedup: vista di carico assegnato.
    if (staffId && data && data >= from && data <= to) {
      righeEsito.push({ staffId, operatore, esitoOk });
    }
    // Produzione = positivo nel range
    if (esitoOk === true && data && data >= from && data <= to) {
      produzioneRighe.push({
        odl, commessa, voce, kpi: gruppoVoce(commessa, voce),
        attivitaKey, attivitaLabel: canon.attivitaPulita, matricola: it.matricola_contatore ?? '',
        data, staffId, operatore, territorioId, territorio,
        valore: valore(commessa, attivitaKey, data),
      });
      /*
        La SARACINESCA è una voce a sé, IN AGGIUNTA alla limitazione padre: stesso intervento,
        due righe di produzione. Prima nasceva dalla colonna del master; ora dalla dichiarazione
        dell'operatore sul rapportino, che è la fonte che il modulo ACEA usa già.

        Sta QUI dentro, e non in un giro a parte, perché la condizione è la stessa della riga
        padre — positivo, nel range — e perché l'intervento porta con sé esecutore, giorno e
        territorio: agganciandola all'ODL, come faceva il master, le 834 massive senza ordine
        ACEA non avrebbero nessuna riga a cui attaccarsi.
      */
      if (saracinescaDichiarata.has(it.id)) {
        produzioneRighe.push({
          odl, commessa: 'acea', voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL,
          matricola: it.matricola_contatore ?? '',
          data, staffId, operatore, territorioId, territorio,
          valore: valore('acea', SARA_KEY, data),
        });
      }
    }
  }

  /*
    Il REGISTRO per ODL: voce e attività, per l'audit e per valorizzare il SAL.

    Rispetto al master che sostituisce, sparisce tutta la gestione delle chiavi `MAT:` — le
    righe massive senza ordine ACEA, che il master teneva dentro con un prefisso finto. Il
    registro contiene ordini veri e basta: quel lavoro esiste ancora, come produzione, ma la
    porta è l'intervento (vedi il giro qui sopra) e non un ODL inventato.

    Sparisce anche il legame a mano padre→figlio della saracinesca (`odl_saracinesca`): il
    registro gli ordini figli ce li ha come ORDINI, con la loro attività «Sostituzione
    saracinesca o valvola», che l'alias porta sulla tariffa. Non serve più dirglielo.
  */
  const registroAudit = new Map<string, RegistroRiga>();
  const registroAttivita = new Map<string, string>();
  // Senza la fetta ACEA il registro resta chiuso: `registroPopolato` deve dire «non pertinente»,
  // non «popolato», o la vista AcquaLatina si porterebbe dietro un audit di ordini altrui.
  for (const r of conAcea ? registroRows : []) {
    const odl = (r.odl ?? '').trim();
    if (!odl) continue;
    registroAudit.set(odl, { voce: risolviVoce(null, r.attivita) });
    // Attività CANONICA (via alias): la chiave GREZZA non aggancia il listino
    // (es. "LIMITAZIONE FLUSSO IDRICO" ≠ tariffa "LIMITAZIONE EROGAZIONE") → altrimenti SAL a 0.
    const canonR = attivitaCanonica('acea', r.attivita, r.comune, alias, comuniMassive);
    if (canonR?.attivitaKey) registroAttivita.set(odl, canonR.attivitaKey);
  }
  // Produzione: le limitazioni massive contano per MATRICOLA (non per riga-intervento), come ACEA.
  const righeDedup = deduplicaMassivePerMatricola(produzioneRighe);
  const produzione = aggregaProduzione(righeDedup);

  /*
    La produzione CONFRONTABILE col SAL: la sola fetta ACEA.

    In «Tutti» il totale di pagina comprende AcquaLatina, che sul portale ACEA non esiste. Metterlo
    a confronto col SAL gonfierebbe lo scarto — l'area gialla del grafico si chiama «da richiedere
    ad ACEA», e ci finirebbero dentro euro che ad ACEA non si chiederanno mai.
  */
  const righeAcea = righeDedup.filter((r) => r.commessa === 'acea');
  const produzioneAcea = aggregaProduzione(righeAcea);

  /*
    Riga "esitata a sistema" per un ODL: è la forma con cui un ODL completato sul portale entra
    nel SAL. Usata da entrambi i rami, E% e non-E.

    Il ramo speciale per gli ODL figli di saracinesca non c'è più: prima serviva perché il
    master non conosceva quegli ordini e bisognava dirgli a mano «questo figlio vale una
    saracinesca». Il registro li ha come ordini propri, con la loro attività, quindi cadono
    nel ramo normale qui sotto e prendono la tariffa dall'alias come qualunque altro.
  */
  const rigaEsitataDa = (odl: string): RigaProduzione => {
    const voce = dbAudit.get(odl)?.voce ?? registroAudit.get(odl)?.voce ?? null;
    const attivitaKey = dbAttivita.get(odl) ?? registroAttivita.get(odl) ?? '';
    const data = dbDataByOdl.get(odl) ?? to;
    return {
      odl, commessa: 'acea', voce, kpi: gruppoVoce('acea', voce),
      attivitaKey, attivitaLabel: attivitaKey, data,
      staffId: '', operatore: '', territorioId: '', territorio: '',
      // Il SAL è ACEA per definizione: nasce dal portale SAP, dove AcquaLatina non esiste.
      valore: valore('acea', attivitaKey, data),
    };
  };

  const portaleAudit = new Map<string, PortaleRiga>();
  const odlCompletatoAny = new Set<string>();
  const salRighe: RigaProduzione[] = [];
  const nonRemuneratoRighe: RigaProduzione[] = [];
  for (const p of conAcea ? portaleRows : []) {
    const odl = (p.odl ?? '').trim();
    if (!odl) continue;
    // il gas riclassificato (committente effettivo italgas) è fuori dalla vista ACEA (audit + SAL)
    if (effByOdl.get(odl) === 'italgas') continue;
    const statoNorm = (p.stato_norm ?? '').trim();
    portaleAudit.set(odl, { statoNorm });
    if (statoNorm !== 'COMPLETATO') continue;
    odlCompletatoAny.add(odl);
    // SAL = ciò che ACEA REMUNERA: solo causa scostamento pagata (inizia per E).
    if (scostamentoPagato(p.causa_scostamento)) {
      salRighe.push(rigaEsitataDa(odl));
    } else {
      // consuntivato dal portale con causale a nostro carico: fuori da "Esitato ACEA" (E%),
      // ma nel pre-SAL completo (decisione utente 10/07: un solo totale, niente distinzione).
      nonRemuneratoRighe.push(rigaEsitataDa(odl));
    }
  }
  const salAgg = aggregaProduzione(salRighe);
  const sal: ProduzioneSal = { totale: salAgg.totale, perVoce: salAgg.perVoce, perGiorno: salAgg.perGiorno };

  const scarto = scartoProduzioneSal(produzioneAcea.totale, sal.totale);

  /*
    «Fuori SAL» = prodotto ma non ancora consuntivato dal portale. Per una saracinesca la chiave
    non è l'ODL della limitazione ma quello del suo ordine figlio, che ora si trova per impianto
    o matricola invece che leggendolo da una colonna annotata a mano.
  */
  const figlioDiRiga = (r: RigaProduzione): string =>
    figlioPerChiave.get(`M:${normMatricola(r.matricola)}`) ?? '';
  /*
    Solo ACEA, e non è un dettaglio: «fuori SAL» vuol dire «prodotto e non ancora consuntivato SUL
    PORTALE». Le righe AcquaLatina non sono su nessun portale, quindi passerebbero TUTTE il filtro
    e si sommerebbero al conto ACEA — nella vista «Tutti» la card diceva 110.437,51 € stando sotto
    l'intestazione «sola quota ACEA», cioè un numero giusto per nessuno.
  */
  const fuoriSalRighe = righeAcea.filter((r) => {
    const k = r.attivitaKey === SARA_KEY ? figlioDiRiga(r) : r.odl;
    return !k || !odlCompletatoAny.has(k);
  });
  const fuoriSal: Totale = aggregaProduzione(fuoriSalRighe).totale;

  // ODL "conosciuti" (controllo leggero dello storico SAL): presenti in DB, registro o portale.
  const odlConosciuti = new Set<string>([...dbAudit.keys(), ...registroAudit.keys(), ...portaleAudit.keys()]);
  const odlGiaPagati = odlPagatiDaSal(salRows);
  const salPerN = new Map<number, SalRow[]>();
  for (const r of conAcea ? salRows : []) {
    if (!salPerN.has(r.sal_n)) salPerN.set(r.sal_n, []);
    salPerN.get(r.sal_n)!.push(r);
  }
  /*
    Le righe di ogni SAL arricchite UNA volta sola — valore a listino e attività canonica — e poi
    riusate sia dallo storico sia dal confronto. L'attività canonica è quella che aggancia il
    listino e, nel confronto, è la CHIAVE con cui una voce del SAL trova la voce omologa della
    produzione: senza, «Limitazione flusso idrico» (testo SAP) e «Limitazione Erogazione» (nome
    di listino) resterebbero due righe distinte che non si sommano mai.
  */
  const salArricchitoPerN = new Map<number, SalRigaConfronto[]>();
  for (const [n, righeSalN] of salPerN) {
    salArricchitoPerN.set(
      n,
      righeSalN.map((r) => {
        const canonSal = r.attivita ? attivitaCanonica('acea', r.attivita, null, alias, comuniMassive) : null;
        const attivitaKey = canonSal?.attivitaKey ?? '';
        const dataVal = r.data_completamento ?? r.data_registrazione ?? to;
        return {
          ...r,
          valoreListino: attivitaKey ? valore('acea', attivitaKey, dataVal) : 0,
          attivitaKey,
          attivitaLabel: canonSal?.attivitaPulita ?? (r.attivita ?? ''),
        };
      }),
    );
  }
  const salStorico: SalStorico[] = [...salArricchitoPerN.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, arricchite]) => riepilogoUnSal(arricchite as SalRigaArricchita[], odlConosciuti));

  /*
    Il confronto SAL ↔ produzione del periodo. Si calcola solo su richiesta (un SAL scelto dalla
    tendina) e solo dove un SAL esiste: in vista AcquaLatina `salPerN` è vuota per costruzione.
  */
  const righeConfronto = salSelezionato != null ? salArricchitoPerN.get(salSelezionato) : undefined;
  const confrontoSal: ConfrontoSal | null = righeConfronto
    ? confrontaSalProduzione(salSelezionato as number, righeConfronto, righeAcea, {
        positiviPeriodo: new Set(righeAcea.map((r) => r.odl.trim()).filter(Boolean)),
        positiviTutti: odlPositiviAcea,
        noti: odlNotiDb,
        inQualcheSal: odlGiaPagati,
      })
    : null;

  // Pre-SAL COMPLETO: tutti gli ODL COMPLETATO sul portale non ancora entrati in un SAL pagato,
  // qualunque sia la causale (E% e non-E insieme — l'utente vuole un solo totale).
  const preSalRighe = [...salRighe, ...nonRemuneratoRighe].filter((r) => !odlGiaPagati.has(r.odl));
  const preSal = {
    n: (salStorico.length > 0 ? Math.max(...salStorico.map((s) => s.n)) : 0) + 1,
    totale: aggregaProduzione(preSalRighe).totale,
  };

  /*
    Giornate-uomo: frazione in-vista/totale per (operatore, giorno). Il DENOMINATORE resta tutto
    il lavorato del giorno, qualunque committente — è il senso della frazione: chi fa mezza
    giornata su ACEA e mezza su italgas non impegna una giornata intera sulla commessa.

    Il numeratore segue la vista: in «Tutti» una giornata mista ACEA+AcquaLatina è una giornata
    piena sulle nostre due commesse, ed è la lettura giusta per la resa €/giornata di pagina.
  */
  const grezziInVista = new Set(committentiGrezzi(vista));
  const righeLavoro: RigaLavoro[] = [];
  for (const l of lavoroRows) {
    const staffId = l.staff_id ?? '';
    const data = (l.data ?? '').slice(0, 10);
    if (!staffId || !data) continue;
    const canon = grezziInVista.has(l.committente ?? '')
      ? attivitaCanonica(l.committente, l.intervento_tipo, l.comune, alias, comuniMassive)
      : null;
    righeLavoro.push({
      staffId,
      operatore: maps.staff.get(staffId) ?? 'Operatore',
      data,
      inCommessa: canon != null && inVista(vista, canon.committenteEff),
    });
  }
  // Split € feriale/sabato sulle stesse righe (dedup) della produzione: la resa deve essere
  // feriale/feriale (spec 2026-07-02); la domenica resta solo nel totale generale.
  const euroFer = new Map<string, number>();
  let valFeriale = 0;
  let valSabato = 0;
  for (const rp of righeDedup) {
    const gs = giornoSettimana(rp.data);
    if (gs >= 1 && gs <= 5) {
      valFeriale += rp.valore;
      if (rp.staffId) euroFer.set(rp.staffId, (euroFer.get(rp.staffId) ?? 0) + rp.valore);
    } else if (gs === 6) {
      valSabato += rp.valore;
    }
  }
  const euroFerialePerOperatore: Aggregato[] = [...euroFer.entries()].map(([chiave, v]) => ({
    chiave, label: chiave, conteggio: 0, valore: v,
  }));
  const personale = aggregaPersonale(righeLavoro, produzione.perOperatore, euroFerialePerOperatore, {
    valoreFeriale: valFeriale,
    sabatoValore: valSabato,
  });
  const esiti = aggregaEsiti(righeEsito, produzione.perOperatore);

  const registroPopolato = registroAudit.size > 0;
  const portalePopolato = portaleAudit.size > 0;
  const auditTutte = riconcilia(
    { db: dbAudit, registro: registroAudit, portale: portaleAudit },
    { registroPopolato, portalePopolato },
  );
  const auditSummary: Record<ClasseDiscrepanza, number> = {
    SOLO_PORTALE: 0,
    DB_NON_IN_REGISTRO: 0,
    REGISTRO_NON_IN_DB: 0,
    POSITIVO_DB_NON_COMPLETATO_PORTALE: 0,
    COMPLETATO_PORTALE_NON_POSITIVO_DB: 0,
    VOCE_DISCORDE: 0,
    VOCE_NON_RISOLTA: 0,
  };
  for (const d of auditTutte) auditSummary[d.classe] += 1;

  return {
    from,
    to,
    vista,
    conContabilizzazione: conAcea,
    listino,
    produzione,
    produzioneAcea: { totale: produzioneAcea.totale, perGiorno: produzioneAcea.perGiorno },
    sal,
    scarto,
    salStorico,
    confrontoSal,
    preSal,
    fuoriSal,
    personale,
    esiti,
    audit: auditTutte.slice(0, AUDIT_CAP),
    auditSummary,
    auditTotale: auditTutte.length,
    auditTruncated: auditTutte.length > AUDIT_CAP,
    registroPopolato,
    portalePopolato,
  };
}
