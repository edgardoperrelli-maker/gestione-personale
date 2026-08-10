// Risoluzione robusta voce rapportino → intervento.
// Il collegamento storico avveniva solo per `staff + ODL` in fase di generazione:
// fragile quando l'ODL manca o l'intervento non è ancora presente. Qui agganciamo
// per più chiavi allineate (ODL, matricola, PDR), con scoping per operatore e
// scartando le chiavi ambigue per non collegare l'intervento sbagliato.
import { ATTIVITA_TASK_VIA } from './manuali/taskVia';

export type InterventoLinkRow = {
  id: string;
  staff_id: string | null;
  odl: string | null;
  matricola_contatore: string | null;
  pdr: string | null;
  /** Indirizzo/via: chiave di aggancio dei soli task-via (bonifiche extra), che non hanno
   *  ODL/matricola/PDR. Usato solo per gli interventi del gruppo BONIFICHE EXTRA. */
  indirizzo?: string | null;
  /** Gruppo attività dell'intervento: discrimina i task-via (BONIFICHE EXTRA) nell'indice per via. */
  gruppo_attivita?: string | null;
};

export type VoceLinkKey = {
  staff_id: string | null;
  odl?: string | null;
  matricola?: string | null;
  pdr?: string | null;
  /** Via della voce: chiave di aggancio SOLO per i task-via (bonifiche extra). Ignorata altrove. */
  via?: string | null;
  /** La voce è un task-via (attività BONIFICHE EXTRA)? Abilita il match per via. */
  taskVia?: boolean;
  /** Stato di approvazione della voce manuale: una `rifiutato` non si aggancia MAI (vedi sotto). */
  approvazione_stato?: string | null;
};

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/**
 * Costruisce un risolutore `voce → intervento_id`. Match allineato per campo e
 * scoping per `staff_id`, in ordine di affidabilità: ODL → matricola → PDR.
 * Una chiave presente su più interventi dello stesso operatore è **ambigua** e
 * viene scartata (meglio non collegare che collegare l'intervento sbagliato).
 */
export function buildVoceInterventoLinker(
  interventi: InterventoLinkRow[],
): (voce: VoceLinkKey) => string | null {
  const byOdl = new Map<string, string | null>();
  const byMatr = new Map<string, string | null>();
  const byPdr = new Map<string, string | null>();
  // Indice per via dei SOLI interventi task-via (gruppo BONIFICHE EXTRA): i figli creati sulla
  // stessa via hanno un gruppo diverso e non entrano qui, quindi non collidono.
  const byViaTaskVia = new Map<string, string | null>();

  const put = (m: Map<string, string | null>, staff: string | null, val: unknown, id: string) => {
    const v = norm(val);
    if (!v) return;
    const k = `${staff ?? ''}|${v}`;
    if (!m.has(k)) m.set(k, id);
    else if (m.get(k) !== id) m.set(k, null); // collisione → ambiguo
  };

  const isGruppoTaskVia = (g: unknown): boolean =>
    String(g ?? '').trim().toUpperCase() === ATTIVITA_TASK_VIA;

  for (const it of interventi) {
    put(byOdl, it.staff_id, it.odl, it.id);
    put(byMatr, it.staff_id, it.matricola_contatore, it.id);
    put(byPdr, it.staff_id, it.pdr, it.id);
    if (isGruppoTaskVia(it.gruppo_attivita)) put(byViaTaskVia, it.staff_id, it.indirizzo, it.id);
  }

  const get = (m: Map<string, string | null>, staff: string | null, ...vals: unknown[]): string | null => {
    for (const val of vals) {
      const v = norm(val);
      if (!v) continue;
      const hit = m.get(`${staff ?? ''}|${v}`);
      if (hit) return hit; // null (ambiguo) o undefined → prova la chiave successiva
    }
    return null;
  };

  return (voce) => {
    // Una voce RIFIUTATA non si aggancia a niente, mai.
    //
    // Il rifiuto dice che quel lavoro non deve essere registrato: un intervento non gli spetta —
    // è la stessa invariante che il DB impone già alla richiesta (CHECK
    // `interventi_manuali_intervento_solo_deciso`: `intervento_id` solo su approvato/auto_liberi),
    // e la voce va tenuta allineata.
    //
    // Senza questo guard il danno non è «un collegamento in più»: è il collegamento all'intervento
    // DI UN ALTRO. Le chiavi qui sotto sono ODL → matricola → PDR, e il PDR è del PUNTO, non del
    // contatore: due misuratori nello stesso stabile lo condividono. La voce rifiutata non trova
    // né il proprio ODL né la propria matricola (l'intervento non è mai stato creato, è quello il
    // senso del rifiuto), scivola sul PDR e aggancia l'intervento del contatore accanto — che è
    // uno solo su quel PDR, quindi la regola di ambiguità qui sopra non scatta.
    //
    // Caso reale del 10/08/2026, VIA FOSSO DELLA CRETA 3, PDR 4000283762 (limitazioni massive):
    // matricola 202015245108 approvata, matricola 202015276720 rifiutata per errore nove minuti
    // dopo e agganciata all'intervento della prima. Da lì lo Storico legge «ESEGUITO SI» su una
    // matricola che quell'intervento non ha, e `leggiVerdettoEsecuzione` dichiara il contatore
    // già eseguito: la pratica non si può più né approvare né rifare — la voce rifiutata blocca
    // il proprio rifacimento. Misurato sul prod lo stesso giorno: 9 voci rifiutate agganciate,
    // 9 su 9 all'intervento di un'altra voce.
    if (voce.approvazione_stato === 'rifiutato') return null;
    const s = voce.staff_id ?? null;
    const perId =
      get(byOdl, s, voce.odl) ??
      get(byMatr, s, voce.matricola) ??
      get(byPdr, s, voce.pdr);
    if (perId) return perId;
    // Task-via (bonifiche extra): niente ODL/matricola/PDR → aggancia per via, ma SOLO per le
    // voci task-via e SOLO tra gli interventi bonifiche-extra (l'indice per via li contiene solo).
    if (voce.taskVia && voce.via) return get(byViaTaskVia, s, voce.via) ?? null;
    return null;
  };
}
