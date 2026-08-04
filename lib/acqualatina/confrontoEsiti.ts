// PURA: il confronto fra gli esiti registrati sul SITO AcquaLatina e il nostro registro.
//
// Il sito è dove l'ufficio registra a mano gli interventi fatti (l'export è il file
// «5ESECUZIONI_…», foglio Esecuzione); il registro è `acqualatina_ordini`, chiuso dai nostri
// rapportini. Sono due mani dello stesso lavoro, e questo confronto trova dove una delle due
// non ha ancora scritto: SOLO lettura, nessuna delle due parti corregge l'altra — il sito non
// è raggiungibile da qui, e il registro si corregge dagli interventi (riconciliazione).
//
// La regola degli esiti è del committente, riferita dall'utente (04/08/2026): «eseguito è
// sempre positivo» — qualunque esito valorizzato nel file («EFFETTUATO NO ANOMALIE»,
// «EFFETTUATO - CONTATORE GUASTO») è lavoro fatto; la cella vuota è l'ODL ancora da esitare.

import { normHeader } from '@/lib/attivita/masterUpload';

/** Una riga del file ESECUZIONI, già ridotta alle colonne che contano. */
export type RigaEsecuzione = {
  /** «Codice Esterno dell'OdL»: lo stesso numero che il registro chiama `odl`. */
  odl: string;
  /** «Codice Cliente»: l'impianto, per il controllo incrociato d'identità. */
  impianto: string;
  esito: string;
  dataFine: string;
};

/** Lo stato per-ODL del registro, come serve al confronto (una voce per riga di registro). */
export type RigaRegistroPerConfronto = {
  odl: string;
  aperto: boolean;
  esito_positivo: boolean | null;
  stato_desc: string | null;
  data_completamento: string | null;
  impianto: string | null;
  nominativo: string | null;
  comune: string | null;
};

export type VoceDaChiudere = {
  odl: string;
  esitoSito: string;
  dataSito: string;
  nominativo: string | null;
  comune: string | null;
  statoNostro: string;
};

export type VoceMancanteSito = {
  odl: string;
  chiusaIl: string | null;
  nominativo: string | null;
  comune: string | null;
};

export type ImpiantoDifforme = {
  odl: string;
  impiantoSito: string;
  impiantoRegistro: string;
};

export type ConfrontoEsiti = {
  /** Sito «effettuato» e registro chiuso positivo: le due mani dicono la stessa cosa. */
  allineati: number;
  /** Sito «effettuato», registro ancora aperto: manca il NOSTRO esito (rapportino o consuntivazione). */
  daChiudereDaNoi: VoceDaChiudere[];
  /**
   * ODL con un intervento IN CORSO oggi: il sito li dà già per fatti (la squadra registra
   * live dal campo), il nostro rapportino arriva a fine giornata. NON stanno in nessuna
   * coda — metterli in «manca il nostro esito» mentre gli operatori lavorano creava solo
   * confusione in ufficio (decisione utente 04/08): si contano e basta, senza elenco.
   */
  inLavorazioneOggi: number;
  /** Registro chiuso positivo, sito senza esito (o senza proprio l'ODL): manca la registrazione sul sito. */
  mancantiSulSito: VoceMancanteSito[];
  /** Righe del file senza esito: gli ODL che il sito stesso dà ancora da fare. */
  nonEsitatiSito: number;
  /** ODL del file che il registro non conosce: o master mai caricato, o ODL di un altro lotto. */
  sconosciuti: string[];
  /** «Codice Cliente» del sito diverso dall'impianto a registro: identità da verificare. */
  impiantiDifformi: ImpiantoDifforme[];
  totaleFile: number;
};

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Riduce il foglio Esecuzione a una riga per ODL.
 *
 * Il file ne porta di doppie (una per componente della squadra: stessa esecuzione, due
 * risorse): a parità di ODL vince la riga CON esito — quella senza è la stessa uscita vista
 * da un'estrazione parziale, non un'informazione in più.
 */
export function parseEsecuzioni(rows: readonly unknown[][]): { righe: RigaEsecuzione[]; totale: number } {
  const COLONNE = {
    odl: 'codiceesternodellodl',
    impianto: 'codicecliente',
    esito: 'esito',
    dataFine: 'datafineesecuzione',
  } as const;
  let idx: Partial<Record<keyof typeof COLONNE, number>> | null = null;
  let headerIdx = -1;
  const lim = Math.min(15, rows.length);
  for (let i = 0; i < lim && !idx; i++) {
    const trovate: Partial<Record<keyof typeof COLONNE, number>> = {};
    (rows[i] ?? []).forEach((h, col) => {
      const n = normHeader(h);
      (Object.keys(COLONNE) as Array<keyof typeof COLONNE>).forEach((c) => {
        if (trovate[c] === undefined && n === COLONNE[c]) trovate[c] = col;
      });
    });
    if (trovate.odl !== undefined && trovate.esito !== undefined) {
      idx = trovate;
      headerIdx = i;
    }
  }
  if (!idx) throw new Error('Colonne «Codice Esterno dell\'OdL» ed «Esito» non trovate nel file.');

  const perOdl = new Map<string, RigaEsecuzione>();
  let totale = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const odl = norm(row[idx.odl as number]);
    if (odl === '') continue;
    totale++;
    const riga: RigaEsecuzione = {
      odl,
      impianto: idx.impianto === undefined ? '' : norm(row[idx.impianto]),
      esito: norm(row[idx.esito as number]),
      dataFine: idx.dataFine === undefined ? '' : norm(row[idx.dataFine]),
    };
    const gia = perOdl.get(odl);
    if (!gia || (gia.esito === '' && riga.esito !== '')) perOdl.set(odl, riga);
  }
  return { righe: [...perOdl.values()], totale };
}

/** Com'è messa la riga da noi, nel racconto del report. */
function statoNostro(righe: readonly RigaRegistroPerConfronto[]): string {
  if (righe.some((r) => !r.aperto && r.esito_positivo === true)) return 'chiusa positiva';
  const desc = righe.find((r) => r.stato_desc)?.stato_desc;
  return desc ? desc.toLowerCase() : 'aperta';
}

export function confrontaEsitiSito(
  file: readonly RigaEsecuzione[],
  registro: readonly RigaRegistroPerConfronto[],
  /** Gli ODL con un intervento della giornata ancora aperto: esclusi dalle code, solo contati. */
  inLavorazione: ReadonlySet<string> = new Set(),
): ConfrontoEsiti {
  const perOdlRegistro = new Map<string, RigaRegistroPerConfronto[]>();
  for (const r of registro) {
    const odl = norm(r.odl);
    if (odl === '') continue;
    perOdlRegistro.set(odl, [...(perOdlRegistro.get(odl) ?? []), r]);
  }

  let allineati = 0;
  let nonEsitatiSito = 0;
  let inLavorazioneOggi = 0;
  const daChiudereDaNoi: VoceDaChiudere[] = [];
  const sconosciuti: string[] = [];
  const impiantiDifformi: ImpiantoDifforme[] = [];
  const esitatiSito = new Set<string>();

  for (const f of file) {
    const righe = perOdlRegistro.get(f.odl);
    if (f.esito !== '') esitatiSito.add(f.odl);
    if (!righe) {
      sconosciuti.push(f.odl);
      continue;
    }
    const impiantoRegistro = righe.find((r) => norm(r.impianto) !== '')?.impianto;
    if (f.impianto !== '' && impiantoRegistro && norm(impiantoRegistro) !== f.impianto) {
      impiantiDifformi.push({ odl: f.odl, impiantoSito: f.impianto, impiantoRegistro: norm(impiantoRegistro) });
    }
    if (f.esito === '') {
      nonEsitatiSito++;
      continue;
    }
    const chiusaPositiva = righe.some((r) => !r.aperto && r.esito_positivo === true);
    if (chiusaPositiva) {
      allineati++;
    } else if (inLavorazione.has(f.odl)) {
      inLavorazioneOggi++;
    } else {
      daChiudereDaNoi.push({
        odl: f.odl,
        esitoSito: f.esito,
        dataSito: f.dataFine,
        nominativo: righe.find((r) => r.nominativo)?.nominativo ?? null,
        comune: righe.find((r) => r.comune)?.comune ?? null,
        statoNostro: statoNostro(righe),
      });
    }
  }

  /*
    La direzione opposta: chiusi positivi da NOI che il sito non dà come effettuati — o l'ODL
    manca dal file, o c'è ma senza esito. È la coda «da registrare sul sito» dell'ufficio.
  */
  const mancantiSulSito: VoceMancanteSito[] = [];
  for (const [odl, righe] of perOdlRegistro) {
    if (esitatiSito.has(odl)) continue;
    const chiusa = righe.find((r) => !r.aperto && r.esito_positivo === true);
    if (!chiusa) continue;
    mancantiSulSito.push({
      odl,
      chiusaIl: chiusa.data_completamento,
      nominativo: righe.find((r) => r.nominativo)?.nominativo ?? null,
      comune: righe.find((r) => r.comune)?.comune ?? null,
    });
  }
  mancantiSulSito.sort((a, b) => (a.chiusaIl ?? '').localeCompare(b.chiusaIl ?? '') || a.odl.localeCompare(b.odl));
  daChiudereDaNoi.sort((a, b) => a.dataSito.localeCompare(b.dataSito) || a.odl.localeCompare(b.odl));

  return {
    allineati, daChiudereDaNoi, inLavorazioneOggi, mancantiSulSito, nonEsitatiSito,
    sconosciuti, impiantiDifformi, totaleFile: file.length,
  };
}
