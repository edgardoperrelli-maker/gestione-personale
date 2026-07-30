// PURA: fonde le fonti dei "master ODL" nelle righe del foglio di lookup del template
// di import (MasterODL): scrivi l'ODS/ODL e il file compila da sé matricola, indirizzo,
// comune e descrizione attività. Fonti (nell'ordine passato dal chiamante, la prima vince):
//   1) i file master caricati a mano (template_master_righe), già curati e completi;
//   2) acea_master_snapshot (master DUNNING/ZAGAROLO via agente), che può mancare di campi.
// La fusione è DIFENSIVA: a parità di ODL i campi vuoti della prima fonte si riempiono
// dalle successive (mai sovrascritti i pieni). La descrizione esce CANONICA di tassonomia
// (stessa risoluzione dell'import, alias inclusi); se l'operazione non è risolvibile resta
// '' — la cella andrà scelta a mano e l'import continua a bloccare le descrizioni mancanti.
import { chiaveTassonomia, committenteEquivalente, risolviGruppo, type TassonomiaRiga } from './tassonomia';

export type RigaMasterOdl = {
  odl: string;
  descrizione: string; // canonica di tassonomia; '' se l'operazione non è risolvibile
  matricola: string;
  indirizzo: string;
  cap: string;
  comune: string;
};

export type FonteMasterRiga = {
  odl?: string | null;
  operazione?: string | null; // testo grezzo attività/operazione della riga
  matricola?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  comune?: string | null;
};

export type FonteMaster = {
  committente: string; // per la risoluzione in tassonomia
  /** GRUPPI ATTIVITÀ del master scelti dal catalogo (selezione multipla, admin). Una riga
   *  senza operazione propria eredita la descrizione SOLO quando la scelta è univoca:
   *  UN gruppo selezionato E il gruppo identifica una sola attività (o una omonima, es.
   *  LIMITAZIONI MASSIVE). Un gruppo eterogeneo (DUNNING) o più gruppi non decidono per
   *  riga: la descrizione resta da scegliere in Excel (tendina della Leggenda). */
  gruppiDefault?: string[] | null;
  righe: FonteMasterRiga[];
};

/** Descrizione canonica che UN gruppo identifica da solo per un committente: l'unica
 *  attiva del gruppo, oppure quella OMONIMA del gruppo (es. 'Sostituzione misuratori' nel
 *  gruppo SOSTITUZIONE MISURATORI, dove convivono singolare e plurale). '' se ambiguo. */
export function descrizioneDaGruppo(
  committente: string,
  gruppo: string,
  index: Map<string, TassonomiaRiga>,
): string {
  const kGruppo = chiaveTassonomia(gruppo);
  if (!kGruppo) return '';
  const c = committenteEquivalente(committente);
  const candidate = [...index.values()].filter(
    (r) => chiaveTassonomia(r.gruppo) === kGruppo && (c === 'altro' || committenteEquivalente(r.committente) === c),
  );
  if (candidate.length === 1) return candidate[0].descrizione;
  return candidate.find((r) => r.descrizioneNorm === kGruppo)?.descrizione ?? '';
}

const t = (v: unknown) => String(v ?? '').trim();

/** True se la chiave è un ODL reale digitabile. Le pseudo-chiavi `MAT:<matricola>` dello
 *  snapshot (righe ZAGAROLO senza ordine vero) non sono ODL: nessuno le scriverebbe nel
 *  template, e nel lookup sarebbero solo rumore. */
export function isOdlReale(odl: string): boolean {
  return odl !== '' && !odl.toUpperCase().startsWith('MAT:');
}

export function costruisciMasterOdl(
  fonti: FonteMaster[],
  index: Map<string, TassonomiaRiga>,
): RigaMasterOdl[] {
  const byOdl = new Map<string, RigaMasterOdl>();
  for (const fonte of fonti ?? []) {
    const gruppi = (fonte.gruppiDefault ?? []).map(t).filter(Boolean);
    const operazioneDefault = gruppi.length === 1
      ? descrizioneDaGruppo(fonte.committente, gruppi[0], index)
      : '';
    for (const r of fonte.righe ?? []) {
      const odl = t(r.odl);
      if (!isOdlReale(odl)) continue;
      const operazione = t(r.operazione) || operazioneDefault;
      const ris = operazione
        ? risolviGruppo(fonte.committente, operazione, index, { allinea: 'scrittura' })
        : null;
      const nuova: RigaMasterOdl = {
        odl,
        descrizione: ris?.descrizione ?? '',
        matricola: t(r.matricola),
        indirizzo: t(r.indirizzo),
        cap: t(r.cap),
        comune: t(r.comune),
      };
      const prima = byOdl.get(odl);
      byOdl.set(odl, prima ? {
        odl,
        descrizione: prima.descrizione || nuova.descrizione,
        matricola: prima.matricola || nuova.matricola,
        indirizzo: prima.indirizzo || nuova.indirizzo,
        cap: prima.cap || nuova.cap,
        comune: prima.comune || nuova.comune,
      } : nuova);
    }
  }
  return [...byOdl.values()];
}
