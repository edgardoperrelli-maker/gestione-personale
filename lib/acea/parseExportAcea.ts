// lib/acea/parseExportAcea.ts
// Lettura dell'export ACEA: da workbook a righe del registro, con avvisi non bloccanti.
//
// L'unica parte con I/O della Parte 2 (exceljs). Tutta la logica di interpretazione sta nelle
// funzioni pure accanto — parseTestoOrdine, famiglia, statiOrdine, scadenza, rigaHash — che sono
// testate a parte. Qui si legge, si mappa, si valida.
//
// Principio: nessuna riga viene MAI scartata in silenzio. Un tipo di ordine ignoto, un misuratore
// non ricavabile o un sospetto troncamento producono un avviso e la riga entra comunque.

import ExcelJS from 'exceljs';
import { normalizzaMatricola, parseTestoOrdine } from './parseTestoOrdine';
import { famigliaDaTipoOrdine } from './famiglia';
import { isAperto, isStatoNoto, normalizzaStato } from './statiOrdine';
import { scadenzaOrdine } from './scadenza';
import { rigaHash } from './rigaHash';
import { testoPulito } from '@/lib/testo/maiuscolo';
import {
  FOGLIO_ATTESO, validaIntestazione, validaProvenienza, type EsitoValidazione,
} from './colonneExport';
import type { AvvisoRiga, RigaOrdineAcea } from './tipi';

// Ri-esportata: vive in parseTestoOrdine (modulo puro e leggero) perché serve anche a chi non può
// tirarsi dietro exceljs — l'aggancio delle saracinesche gira anche nel bundle del client.
export { normalizzaMatricola } from './parseTestoOrdine';

export type EsitoParse =
  | {
      ok: true;
      righe: RigaOrdineAcea[];
      avvisi: AvvisoRiga[];
      /** Finestra coperta dal file (min/max data di creazione): serve al riepilogo dell'import. */
      finestra: { dal: string | null; al: string | null };
    }
  | { ok: false; motivo: string; dettagli?: string[] };

/** Testo da una cella exceljs (rich text / formula / hyperlink / data / scalare). */
function testoCella(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDaData(v);
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result === null || v.result === undefined ? '' : String(v.result);
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink;
  }
  return String(v);
}

/**
 * Date come 'YYYY-MM-DD' leggendo i componenti UTC.
 * exceljs restituisce le date Excel a mezzanotte UTC: usare i getter locali le farebbe slittare
 * di un giorno nei fusi a est/ovest, e le date qui governano scadenze e SLA.
 */
function isoDaData(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const g = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

/**
 * Ogni cella di testo dell'export entra MAIUSCOLA e con gli spazi a posto.
 *
 * Passa di qui tutto il testo dell'ordine, quindi è l'unico punto da toccare perché il registro
 * resti pulito: prima l'export di ACEA portava dentro «Sul Posto» accanto a «SUL POSTO», e la
 * stessa attività in tre grafie diverse diventava tre voci nell'imbuto di colonna.
 *
 * `famiglia`, `stato` e `riga_hash` NON passano da qui — sono variabili a parte, ed è giusto così:
 * il primo è un interruttore del codice (`dunning`/`massive`), l'ultimo un hash esadecimale.
 *
 * CONSEGUENZA NOTA: `riga_hash` si calcola DAI valori della riga, quindi il primo import dopo
 * questa modifica vede tutte le righe come cambiate e le riscrive una volta. Innocuo — i valori
 * coincidono già con quelli bonificati il 07/08/2026 — ma il conteggio «modificate» di quel giro
 * sarà pari al registro intero, e vale la pena saperlo prima di leggerlo come un allarme.
 */
const t = (s: string): string | null => testoPulito(s);

/** Numero da cella: null se vuota o non numerica. */
function numero(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export type OpzioniParse = {
  /** Override della firma di commessa (per i test o per una commessa diversa). */
  provenienza?: { contratto?: string; fornitore?: string };
};

/** Legge il workbook e produce le righe del registro. */
export async function parseExportAcea(
  buffer: ArrayBuffer | Buffer,
  opts: OpzioniParse = {},
): Promise<EsitoParse> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch (e) {
    return { ok: false, motivo: `File non leggibile come Excel: ${e instanceof Error ? e.message : 'formato sconosciuto'}` };
  }

  // Il foglio atteso, altrimenti il primo: un rinominato non deve bloccare l'import, ci pensa
  // la validazione dell'intestazione a dire se il contenuto è quello giusto.
  const ws = wb.getWorksheet(FOGLIO_ATTESO) ?? wb.worksheets[0];
  if (!ws) return { ok: false, motivo: 'Il file non contiene fogli.' };

  const header = ((ws.getRow(1).values as ExcelJS.CellValue[]) ?? [])
    .slice(1)
    .map((c) => testoCella(c).trim());

  const vIntest: EsitoValidazione = validaIntestazione(header);
  if (!vIntest.ok) return { ok: false, motivo: vIntest.motivo, dettagli: vIntest.dettagli };

  const indice = new Map<string, number>();
  header.forEach((h, i) => { if (h !== '' && !indice.has(h)) indice.set(h, i); });

  const righe: RigaOrdineAcea[] = [];
  const avvisi: AvvisoRiga[] = [];
  const perProvenienza: { contratto: string | null; fornitore: string | null }[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (nome: string): string => {
      const i = indice.get(nome);
      return i === undefined ? '' : testoCella(row.getCell(i + 1).value);
    };

    const odl = g('Ordine').trim();
    if (odl === '') continue; // righe vuote o di coda

    const numeroOperazione = g('Numero Operazione').trim();
    const tipoOrdine = t(g('Tipo di ordine'));
    const { famiglia, riconosciuto } = famigliaDaTipoOrdine(tipoOrdine);
    if (!riconosciuto) {
      avvisi.push({
        odl, numero_operazione: numeroOperazione, tipo: 'tipo_ordine_ignoto', famiglia,
        dettaglio: `Tipo di ordine "${tipoOrdine ?? ''}" non riconosciuto: la riga entra come dunning.`,
      });
    }

    const stato = normalizzaStato(g('Stato Operazione'));
    // Uno stato mai visto entra come APERTO (vedi isAperto) ma non passa in silenzio: se ACEA ne
    // introduce uno nuovo, va saputo al primo import e non tre settimane dopo.
    if (stato !== '' && !isStatoNoto(stato)) {
      avvisi.push({
        odl, numero_operazione: numeroOperazione, tipo: 'stato_ignoto', famiglia,
        dettaglio: `Stato "${stato}" mai visto prima: la riga entra come aperta e va controllata.`,
      });
    }
    const dataCreazione = g('Data documento').trim();

    // Misuratore: la colonna quando c'è, altrimenti il testo dell'ordine (massive e saracinesche).
    const matricolaColonna = t(g('Matricola misuratore'));
    const impiantoColonna = t(g('Impianto'));
    const dalTesto = parseTestoOrdine(g('Testo breve Ordine'));
    const matricola = matricolaColonna ?? dalTesto.matricola;
    const impianto = impiantoColonna ?? dalTesto.impianto;
    const origineMisuratore: 'colonna' | 'testo' | null =
      matricolaColonna || impiantoColonna ? 'colonna' : (dalTesto.matricola || dalTesto.impianto ? 'testo' : null);

    if (dalTesto.sospettoTroncamento) {
      avvisi.push({
        odl, numero_operazione: numeroOperazione, tipo: 'sospetto_troncamento', famiglia,
        dettaglio: `Il testo dell'ordine è al limite dei 40 caratteri: la matricola "${dalTesto.matricola ?? ''}" potrebbe essere tagliata.`,
      });
    }
    if (!matricola && !impianto) {
      avvisi.push({
        odl, numero_operazione: numeroOperazione, tipo: 'misuratore_assente', famiglia,
        dettaglio: 'Nessun impianto né matricola ricavabile (atteso sulle rimozioni allacci abusivi).',
      });
    }

    const contratto = t(g('Contratto'));
    const fornitore = t(g('Fornitore'));
    perProvenienza.push({ contratto, fornitore });

    const riga: RigaOrdineAcea = {
      odl,
      numero_operazione: numeroOperazione,
      contratto,
      fornitore,
      tipo_ordine: tipoOrdine,
      famiglia,
      denominazione: t(g('Denominazione testo breve')),
      attivita: t(g('Operazione testo breve')),
      chiave_testo: t(g('Chiave testo standard')),
      testo_ordine: t(g('Testo breve Ordine')),
      stato,
      stato_desc: t(g('Descrizione Stato Ordine')),
      aperto: isAperto(stato),
      data_creazione: dataCreazione,
      cardine_dal: t(g('Data inizio cardine')),
      cardine_al: t(g('Data fine cardine')),
      data_completamento: t(g('Data Completamento')),
      chiusura_tecnica: t(g('Chius.tec.')),
      scadenza: scadenzaOrdine({ famiglia, codiceSla: g('Codice SLA Appalto'), dataCreazione }),
      cid: t(g('C.I.D.')),
      operatore_cognome: t(g('Cognome C.I.D.')),
      operatore_nome: t(g('Nome C.I.D.')),
      causale: t(g('Causa dello scostamento')),
      causale_desc: t(g('Descrizione causale scostamento')),
      // "Icona causa scost.": LED_GREEN = eseguito, LED_RED = non eseguito, vuoto = non ancora esitato
      esito_positivo: (() => {
        const icona = g('Icona causa scost.').trim().toUpperCase();
        if (icona === '') return null;
        return icona.includes('GREEN');
      })(),
      testo_conferma: t(g('Testo conferma')),
      via: t(g('Via')),
      civico: t(g('N. civico')),
      cap: t(g('CAP')),
      comune: t(g('Località')),
      provincia: t(g('Rg')),
      frazione: t(g('Frazione')),
      sede_tecnica: t(g('Sede tecnica')),
      sede_tecnica_desc: t(g('Definizione della sede tecnica')),
      impianto,
      matricola,
      matricola_norm: normalizzaMatricola(matricola),
      origine_misuratore: origineMisuratore,
      sospetto_troncamento: dalTesto.sospettoTroncamento,
      valore_netto: numero(g('Valore Netto')),
      documento_acquisto: t(g('Documento Acquisto')),
      posizione_documento: t(g('Posizione Documento Acquisti')),
      documento_chiusura: t(g('Documento Chiusura')),
      wbs: t(g('Elemento WBS')),
      // Le revoche figlie di un OdM padre non vanno consuntivate due volte.
      escludi_consuntivazione: g('Escludi OdM / Operazione dalla consuntivazione').trim().toUpperCase() === 'X',
      odm_riferimento: t(g('OdM riferimento')),
      odm_operazione_riferimento: t(g('OdM operazione riferimento')),
      codice_sla: t(g('Codice SLA Appalto')),
      priorita: t(g('Priorità ordine')),
      priorita_testo: t(g('Testo priorità')),
      centro_lavoro: t(g('Centro di Lavoro')),
      tam: t(g('TAM')),
      direttore_operativo: t(g('Direttore Operativo')),
      avviso: t(g('Avviso')),
      codice_accesso: t(g('Codice Access. 218')),
      riga_hash: '',
    };
    riga.riga_hash = rigaHash(riga);
    righe.push(riga);
  }

  const vProv = validaProvenienza(perProvenienza, opts.provenienza);
  if (!vProv.ok) return { ok: false, motivo: vProv.motivo, dettagli: vProv.dettagli };

  const date = righe.map((r) => r.data_creazione).filter((d) => d !== '').sort();
  return {
    ok: true,
    righe,
    avvisi,
    finestra: { dal: date[0] ?? null, al: date[date.length - 1] ?? null },
  };
}
