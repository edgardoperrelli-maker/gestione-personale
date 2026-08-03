// PURA: aggrega le righe di produzione (interventi positivi già valorizzati) per voce, operatore,
// territorio e giorno. Modello sul pattern di lib/performance/shape.ts (buildDistribuzioni/buildGiornaliera).
// Le voci non risolte (voce === null) confluiscono nel gruppo 'NON_RISOLTA' (in coda) e nel contatore
// `nonRisolte`, così la mancata classificazione resta sempre visibile (mai silenziosa).

import { ETICHETTA_VISTA, type Commessa } from './committente';

export interface RigaProduzione {
  odl: string;
  /** Chi paga questa riga: decide il listino a monte e il raggruppamento a valle. */
  commessa: Commessa;
  voce: number | null;
  kpi: string | null; // 'EL'|'ES'|'ERC'|'ERA'|null (raggruppamento KPI)
  attivitaKey: string; // chiave normalizzata dell'attività (aggancio prezzo/listino)
  attivitaLabel: string; // etichetta leggibile dell'attività
  matricola?: string; // matricola misuratore (unità di conteggio delle limitazioni massive)
  data: string; // 'YYYY-MM-DD'
  staffId: string;
  operatore: string;
  territorioId: string;
  territorio: string;
  valore: number; // già valorizzato (prezzo×qty); 0 se attività/prezzo mancante
}

export interface Aggregato {
  chiave: string;
  label: string;
  conteggio: number;
  valore: number;
}

export interface ProduzioneAggregata {
  totale: { conteggio: number; valore: number };
  perVoce: Aggregato[];
  perAttivita: Aggregato[];
  perOperatore: Aggregato[];
  perTerritorio: Aggregato[];
  perGiorno: Aggregato[];
  /** Quanto ha prodotto ciascuna commessa: nella vista «Tutti» è il taglio che interessa davvero. */
  perCommessa: Aggregato[];
  nonRisolte: number;
}

const ORDINE_VOCE = ['EL', 'ES', 'ERC', 'ERA'];

/**
 * Posizione di un gruppo nel donut: prima le voci ACEA nell'ordine di fatturazione, poi i gruppi
 * nuovi (le commesse senza tassonomia di voce), e «Non classificata» sempre ULTIMA — è il residuo,
 * e un residuo in mezzo alla lista si legge come una categoria.
 */
function posVoce(chiave: string): number {
  if (chiave === 'NON_RISOLTA') return ORDINE_VOCE.length + 1;
  const i = ORDINE_VOCE.indexOf(chiave);
  return i < 0 ? ORDINE_VOCE.length : i;
}

// Chiave attività delle limitazioni massive (unità = matricola, non riga-intervento).
const KEY_LIM_MASSIVA = 'LIMITAZIONE MASSIVA';

/**
 * Deduplica le righe di produzione delle LIMITAZIONI MASSIVE per MATRICOLA (fallback ODL):
 * più interventi/rapportini positivi sulla stessa matricola contano come UNA sola limitazione,
 * come le conta ACEA (che valorizza per matricola). I lavori manuali dal campo a volte hanno
 * solo la matricola, per questo è la chiave primaria. Le righe massive prive sia di matricola
 * sia di ODL restano distinte (nessun identificativo per collassarle). Le voci diverse dalla
 * limitazione massiva passano invariate.
 */
export function deduplicaMassivePerMatricola(righe: RigaProduzione[]): RigaProduzione[] {
  const vistiMassive = new Set<string>();
  const out: RigaProduzione[] = [];
  for (const r of righe) {
    if (r.attivitaKey !== KEY_LIM_MASSIVA) {
      out.push(r);
      continue;
    }
    const chiave = (r.matricola ?? '').trim() || (r.odl ?? '').trim();
    if (!chiave) {
      out.push(r); // nessun identificativo → non collassabile
      continue;
    }
    if (vistiMassive.has(chiave)) continue; // duplicato della stessa matricola/ODL
    vistiMassive.add(chiave);
    out.push(r);
  }
  return out;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type Acc = { chiave: string; label: string; conteggio: number; valore: number };

function raggruppa(
  righe: RigaProduzione[],
  chiaveDi: (r: RigaProduzione) => string,
  labelDi: (r: RigaProduzione) => string,
): Map<string, Acc> {
  const m = new Map<string, Acc>();
  for (const r of righe) {
    const k = chiaveDi(r);
    let a = m.get(k);
    if (!a) {
      a = { chiave: k, label: labelDi(r), conteggio: 0, valore: 0 };
      m.set(k, a);
    }
    a.conteggio += 1;
    a.valore += r.valore;
  }
  for (const a of m.values()) a.valore = round2(a.valore);
  return m;
}

export function aggregaProduzione(righe: RigaProduzione[]): ProduzioneAggregata {
  const totale = {
    conteggio: righe.length,
    valore: round2(righe.reduce((s, r) => s + r.valore, 0)),
  };

  const perVoce = Array.from(
    raggruppa(
      righe,
      (r) => r.kpi ?? 'NON_RISOLTA',
      (r) => r.kpi ?? 'NON_RISOLTA',
    ).values(),
  ).sort((a, b) => posVoce(a.chiave) - posVoce(b.chiave) || (a.chiave < b.chiave ? -1 : 1));

  const perAttivita = Array.from(
    raggruppa(
      righe,
      (r) => r.attivitaKey || '—',
      (r) => r.attivitaLabel || 'Senza attività',
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  const perOperatore = Array.from(
    raggruppa(
      righe,
      (r) => r.staffId || '—',
      (r) => r.operatore || 'Sconosciuto',
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  const perTerritorio = Array.from(
    raggruppa(
      righe,
      (r) => r.territorioId || '—',
      (r) => r.territorio || 'Senza territorio',
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  const perGiorno = Array.from(
    raggruppa(
      righe,
      (r) => r.data.slice(0, 10),
      (r) => r.data.slice(0, 10),
    ).values(),
  ).sort((a, b) => (a.chiave < b.chiave ? -1 : a.chiave > b.chiave ? 1 : 0));

  const perCommessa = Array.from(
    raggruppa(
      righe,
      (r) => r.commessa,
      (r) => ETICHETTA_VISTA[r.commessa],
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  /*
    «Non risolte» conta SOLO ACEA. La voce è il codice di fatturazione ACEA (EL/ES/ERC/ERA): una
    riga AcquaLatina senza voce non è un dato da sistemare, è una riga di una commessa che quella
    tassonomia non ce l'ha. Contarla qui accenderebbe un allarme che nessuno può spegnere.
  */
  const nonRisolte = righe.reduce((n, r) => n + (r.voce == null && r.commessa === 'acea' ? 1 : 0), 0);

  return { totale, perVoce, perAttivita, perOperatore, perTerritorio, perGiorno, perCommessa, nonRisolte };
}
