// PURA: confronto fra un SAL ufficiale ACEA e la produzione di un periodo.
//
// È la verifica che si faceva a mano, aprendo l'export accanto alla pagina: «il SAL 2 vale quanto
// abbiamo prodotto a luglio?». La risposta interessante non è mai il totale — quello non torna
// quasi mai, perché ACEA consuntiva con settimane di ritardo — ma DOVE non torna: quali voci
// combaciano al centesimo, quali no, e quanti ODL pagati non risultano nostri.
//
// La differenza si legge sempre nella stessa direzione: produzione MENO SAL. Positiva = lavoro
// fatto e non ancora pagato; negativa = ACEA ha pagato più di quanto risulta a noi, che è la
// spia da guardare per prima (di solito è un esito che non abbiamo registrato).
import type { RigaProduzione } from './aggregaProduzione';
import type { SalRigaArricchita } from './salUfficiale';
import type { Totale } from './riconciliazione';

/** Riga di SAL pronta per il confronto: valorizzata a listino e agganciata all'attività canonica. */
export interface SalRigaConfronto extends SalRigaArricchita {
  attivitaKey: string;
  attivitaLabel: string;
}

export interface VoceConfronto {
  chiave: string;
  label: string;
  prodConteggio: number;
  prodValore: number;
  salConteggio: number;
  /** Valore APS ufficiale ACEA: è quello che ci pagano, non la nostra valorizzazione. */
  salValore: number;
  delta: number;
}

export interface OdlConfronto {
  /** ODL del SAL che risultano nostri, positivi e dentro il periodo: il nucleo che torna. */
  inProduzione: number;
  /** ODL del SAL nostri e positivi, ma lavorati fuori dal periodo scelto. */
  fuoriPeriodo: number;
  /** ODL che ACEA ha pagato ma che da noi non sono positivi: esiti da rivedere. */
  nonPositivi: number;
  /** ODL pagati che nel nostro database non esistono affatto. */
  sconosciuti: number;
  /** ODL prodotti nel periodo che nessun SAL ha ancora pagato. */
  produzioneNonPagata: number;
}

export interface ConfrontoSal {
  n: number;
  /** Finestra di completamento lavori coperta dal SAL (min/max), indipendente dal periodo scelto. */
  salDal: string;
  salAl: string;
  salRighe: number;
  salOrdini: number;
  salValoreAps: number;
  salValoreListino: number;
  /** Produzione ACEA del periodo a schermo: è il termine di paragone. */
  produzione: Totale;
  /** produzione.valore − salValoreAps. */
  differenza: number;
  perVoce: VoceConfronto[];
  odl: OdlConfronto;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface IndiceOdl {
  /** ODL con un intervento POSITIVO nel periodo confrontato. */
  positiviPeriodo: ReadonlySet<string>;
  /** ODL con un intervento positivo in qualunque data. */
  positiviTutti: ReadonlySet<string>;
  /** Tutti gli ODL che compaiono nei nostri interventi, qualunque esito. */
  noti: ReadonlySet<string>;
  /** ODL già presenti in un SAL qualsiasi (serve a contare il prodotto-non-pagato). */
  inQualcheSal: ReadonlySet<string>;
}

/**
 * Confronta un SAL con la produzione ACEA di un periodo.
 *
 * `produzione` sono le righe già deduplicate e valorizzate del periodo (le stesse che fanno il
 * totale di pagina), non gli interventi grezzi: il confronto deve leggere gli stessi numeri che
 * l'utente ha davanti, altrimenti spiega uno scarto che a schermo non c'è.
 */
export function confrontaSalProduzione(
  n: number,
  righeSal: readonly SalRigaConfronto[],
  produzione: readonly RigaProduzione[],
  indice: IndiceOdl,
): ConfrontoSal {
  const date = righeSal
    .map((r) => r.data_completamento)
    .filter((d): d is string => !!d)
    .sort();

  const voci = new Map<string, VoceConfronto>();
  const tocca = (chiave: string, label: string): VoceConfronto => {
    let v = voci.get(chiave);
    if (!v) {
      v = { chiave, label, prodConteggio: 0, prodValore: 0, salConteggio: 0, salValore: 0, delta: 0 };
      voci.set(chiave, v);
    }
    // La prima etichetta non vuota vince: la produzione porta il nome pulito del listino, il SAL
    // il testo SAP. Con la chiave vuota (attività non riconosciuta) l'etichetta è l'unico appiglio.
    if (!v.label && label) v.label = label;
    return v;
  };

  for (const r of produzione) {
    const v = tocca(r.attivitaKey, r.attivitaLabel || r.attivitaKey);
    v.prodConteggio += 1;
    v.prodValore += r.valore;
  }
  for (const r of righeSal) {
    const v = tocca(r.attivitaKey, r.attivitaLabel || r.attivita || r.attivitaKey);
    v.salConteggio += 1;
    v.salValore += r.valore;
  }

  const perVoce = [...voci.values()]
    .map((v) => ({
      ...v,
      prodValore: round2(v.prodValore),
      salValore: round2(v.salValore),
      delta: round2(v.prodValore - v.salValore),
    }))
    // Le voci che sbilanciano di più stanno in cima: è l'ordine in cui si guardano.
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const odlSal = new Set(righeSal.map((r) => r.odl.trim()).filter(Boolean));
  const odl: OdlConfronto = {
    inProduzione: 0,
    fuoriPeriodo: 0,
    nonPositivi: 0,
    sconosciuti: 0,
    produzioneNonPagata: 0,
  };
  for (const o of odlSal) {
    if (indice.positiviPeriodo.has(o)) odl.inProduzione += 1;
    else if (indice.positiviTutti.has(o)) odl.fuoriPeriodo += 1;
    else if (indice.noti.has(o)) odl.nonPositivi += 1;
    else odl.sconosciuti += 1;
  }
  /*
    Il prodotto-non-pagato si conta sugli ODL della produzione a schermo: le limitazioni massive
    nate senza ordine ACEA un ODL non ce l'hanno e restano fuori da sole — non c'è un ordine da
    reclamare, c'è un ordine da chiedere. Le righe saracinesca invece l'ODL ce l'hanno (quello
    della limitazione MADRE): non gonfiano il conteggio solo perché il Set lo ha già contato con
    la riga della limitazione stessa.
  */
  const odlProdotti = new Set(produzione.map((r) => r.odl.trim()).filter(Boolean));
  for (const o of odlProdotti) if (!indice.inQualcheSal.has(o)) odl.produzioneNonPagata += 1;

  const produzioneTot: Totale = {
    conteggio: produzione.length,
    valore: round2(produzione.reduce((s, r) => s + r.valore, 0)),
  };
  const salValoreAps = round2(righeSal.reduce((s, r) => s + r.valore, 0));

  return {
    n,
    salDal: date[0] ?? '',
    salAl: date[date.length - 1] ?? '',
    salRighe: righeSal.length,
    salOrdini: odlSal.size,
    salValoreAps,
    salValoreListino: round2(righeSal.reduce((s, r) => s + r.valoreListino, 0)),
    produzione: produzioneTot,
    differenza: round2(produzioneTot.valore - salValoreAps),
    perVoce,
    odl,
  };
}
