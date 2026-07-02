import JSZip from 'jszip';
import type { ProduzioneEconomica } from './load';

// Iniezione dati in un template .xlsx PRESERVANDO i grafici nativi: si riscrivono solo i valori delle
// celle (foglio "Dati"/"Dettaglio"/"Audit"), non si ri-serializza il workbook (ExcelJS perderebbe i
// grafici). Tecnica jszip-chirurgica, gemella di tools/limitazioni-sync/lib/acea/aggiornaStatoXlsx.mjs.

const AUDIT_LABEL: Record<string, string> = {
  SOLO_PORTALE: 'Solo nel portale (assente da DB e master)',
  DB_NON_IN_MASTER: 'Nel DB ma non nel master',
  MASTER_NON_IN_DB: 'Nel master ma non nel DB',
  POSITIVO_DB_NON_COMPLETATO_PORTALE: 'Positivo DB non consuntivato (Produzione > SAL)',
  COMPLETATO_PORTALE_NON_POSITIVO_DB: 'Consuntivato portale non positivo nel DB',
  VOCE_DISCORDE: 'Voce DB ≠ voce master',
  VOCE_NON_RISOLTA: 'Voce non derivabile dall’attività',
};

type Valore = string | number;
type CellePerFoglio = Record<string, Record<string, Valore>>;

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Riscrive nel XML del foglio i valori indicati (numeri → <v>, testo → inlineStr), preservando lo
 *  stile s="…". Le celle mancanti vengono ignorate (il template le pre-crea tutte). PURA. */
export function iniettaCelle(xml: string, celle: Record<string, Valore>): string {
  let out = xml;
  for (const [ref, value] of Object.entries(celle)) {
    const re = new RegExp(`<c r="${ref}"([^>]*)>.*?</c>`);
    const m = out.match(re);
    if (!m) continue; // best-effort
    const sMatch = m[1].match(/\ss="(\d+)"/);
    const s = sMatch ? ` s="${sMatch[1]}"` : '';
    const cella =
      typeof value === 'number' && Number.isFinite(value)
        ? `<c r="${ref}"${s} t="n"><v>${value}</v></c>`
        : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(String(value))}</t></is></c>`;
    out = out.replace(re, () => cella);
  }
  return out;
}

/** Risolve nomeFoglio → percorso XML nel package (via workbook.xml + rels). */
function risolviFogli(wbXml: string, relsXml: string): Map<string, string> {
  const name2rid = new Map<string, string>();
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) name2rid.set(m[1], m[2]);
  const rid2target = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const tag = m[0];
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rid2target.set(id, target);
  }
  const out = new Map<string, string>();
  for (const [name, rid] of name2rid) {
    const t = rid2target.get(rid);
    if (!t) continue;
    out.set(name, t.startsWith('/') ? t.slice(1) : t.startsWith('xl/') ? t : `xl/${t}`);
  }
  return out;
}

/** Inietta i valori nel template (buffer .xlsx) e restituisce il nuovo buffer, grafici preservati. */
export async function iniettaTemplate(templateBuf: Buffer, perFoglio: CellePerFoglio): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuf);
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const fogli = risolviFogli(wbXml, relsXml);
  for (const [nome, celle] of Object.entries(perFoglio)) {
    const path = fogli.get(nome);
    const file = path ? zip.file(path) : null;
    if (!file) continue;
    const xml = await file.async('string');
    zip.file(path!, iniettaCelle(xml, celle));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const VOCI_ORDINE = ['EL', 'ES', 'ERC', 'ERA', 'NON_RISOLTA'];

/** Mappa gli aggregati di Produzione economica alle celle del template. PURA (testabile). */
export function mappaCelleProduzione(dati: ProduzioneEconomica): CellePerFoglio {
  const perVoce = (ch: string) => dati.produzione.perVoce.find((v) => v.chiave === ch);
  const salVoce = (ch: string) => dati.sal.perVoce.find((v) => v.chiave === ch);

  const Dati: Record<string, Valore> = { B9: dati.from, B10: dati.to };
  VOCI_ORDINE.forEach((ch, i) => {
    const r = 2 + i;
    Dati[`B${r}`] = perVoce(ch)?.conteggio ?? 0;
    Dati[`C${r}`] = perVoce(ch)?.valore ?? 0;
    Dati[`D${r}`] = salVoce(ch)?.valore ?? 0;
  });

  const Dettaglio: Record<string, Valore> = {};
  dati.produzione.perOperatore.slice(0, 15).forEach((o, i) => {
    const r = 2 + i;
    Dettaglio[`A${r}`] = o.label;
    Dettaglio[`B${r}`] = o.conteggio;
    Dettaglio[`C${r}`] = o.valore;
  });
  dati.produzione.perTerritorio.slice(0, 15).forEach((o, i) => {
    const r = 2 + i;
    Dettaglio[`E${r}`] = o.label;
    Dettaglio[`F${r}`] = o.conteggio;
    Dettaglio[`G${r}`] = o.valore;
  });
  dati.produzione.perGiorno.slice(0, 31).forEach((o, i) => {
    const r = 2 + i;
    Dettaglio[`I${r}`] = o.chiave;
    Dettaglio[`J${r}`] = o.valore;
  });
  dati.produzione.perAttivita.slice(0, 40).forEach((o, i) => {
    const r = 2 + i;
    Dettaglio[`L${r}`] = o.label;
    Dettaglio[`M${r}`] = o.conteggio;
    Dettaglio[`N${r}`] = o.valore;
  });

  const Audit: Record<string, Valore> = {};
  dati.audit.slice(0, 200).forEach((d, i) => {
    const r = 2 + i;
    Audit[`A${r}`] = d.odl;
    Audit[`B${r}`] = AUDIT_LABEL[d.classe] ?? d.classe;
  });

  return { Dati, Dettaglio, Audit };
}

// ── Fogli extra (personale / SAL per giorno) anche sulla via template ────────
// Il template con grafici nativi non contiene questi fogli e non può riceverli via iniettaCelle
// (best-effort su celle esistenti): li APPENDIAMO al package scrivendo raw XML — worksheet senza
// stili + registrazione in workbook.xml / rels / [Content_Types].xml. I grafici restano intatti
// perché non si ri-serializza nulla di esistente.

export interface FoglioSemplice {
  nome: string;
  righe: Array<Array<string | number>>;
}

/** Nome colonna Excel 0-based: 0→A, 25→Z, 26→AA. */
function colonna(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export async function aggiungiFogli(buf: Buffer, fogli: FoglioSemplice[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  let wbXml = await zip.file('xl/workbook.xml')!.async('string');
  let relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  let ctXml = await zip.file('[Content_Types].xml')!.async('string');

  // Primi indici liberi (sheetN.xml, rIdN, sheetId) — il template può averne di arbitrari.
  const maxDi = (xml: string, re: RegExp) => Math.max(0, ...[...xml.matchAll(re)].map((m) => Number(m[1])));
  let nextFile = maxDi(ctXml, /worksheets\/sheet(\d+)\.xml/g) + 1;
  let nextRid = maxDi(relsXml, /Id="rId(\d+)"/g) + 1;
  let nextSheetId = maxDi(wbXml, /<sheet[^>]*sheetId="(\d+)"/g) + 1;

  for (const f of fogli) {
    const file = `worksheets/sheet${nextFile}.xml`;
    const rowsXml = f.righe
      .map((riga, ri) => {
        const celle = riga
          .map((v, ci) => {
            const ref = `${colonna(ci)}${ri + 1}`;
            return typeof v === 'number' && Number.isFinite(v)
              ? `<c r="${ref}" t="n"><v>${v}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(String(v))}</t></is></c>`;
          })
          .join('');
        return `<row r="${ri + 1}">${celle}</row>`;
      })
      .join('');
    zip.file(
      `xl/${file}`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
    );
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/${file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    );
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="rId${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${file}"/></Relationships>`,
    );
    // xmlns:r dichiarato sul tag stesso (autosufficiente): il workbook.xml del template può
    // dichiararlo per-sheet anziché sul root <workbook>, quindi non va dato per scontato ereditato.
    wbXml = wbXml.replace(
      '</sheets>',
      `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${escXml(f.nome)}" sheetId="${nextSheetId}" r:id="rId${nextRid}"/></sheets>`,
    );
    nextFile += 1;
    nextRid += 1;
    nextSheetId += 1;
  }

  zip.file('xl/workbook.xml', wbXml);
  zip.file('xl/_rels/workbook.xml.rels', relsXml);
  zip.file('[Content_Types].xml', ctXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Fogli extra dell'export Produzione economica (personale + SAL per giorno). PURA. */
export function fogliPersonale(dati: ProduzioneEconomica): FoglioSemplice[] {
  return [
    {
      nome: 'Dati - personale',
      righe: [
        ['Operatore', 'Giornate (feriali)', 'Interventi ACEA', 'Produzione EUR', 'Resa EUR/gg', 'Assegnati', 'Positivi', 'Negativi', 'Non lavorati'],
        ...dati.personale.perOperatore.map((o): Array<string | number> => {
          const e = dati.esiti.find((x) => x.chiave === o.chiave);
          return [o.label, o.giornate, o.interventiAcea, o.valore, o.resa ?? '', e?.assegnati ?? 0, e?.positivi ?? 0, e?.negativi ?? 0, e?.nonLavorati ?? 0];
        }),
        ['Sabati (attivazioni)', dati.personale.sabato.giornate, '', dati.personale.sabato.valore, '', '', '', '', ''],
        ['TOTALE (feriali)', dati.personale.totaleGiornate, '', dati.personale.valoreFeriale, '', '', '', '', ''],
      ],
    },
    {
      nome: 'Dati - SAL giorni',
      righe: [
        ['Giorno', 'ODL', 'SAL EUR'],
        ...dati.sal.perGiorno.map((g): Array<string | number> => [g.chiave, g.conteggio, g.valore]),
      ],
    },
  ];
}
