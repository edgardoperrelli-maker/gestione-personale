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

  const Audit: Record<string, Valore> = {};
  dati.audit.slice(0, 200).forEach((d, i) => {
    const r = 2 + i;
    Audit[`A${r}`] = d.odl;
    Audit[`B${r}`] = AUDIT_LABEL[d.classe] ?? d.classe;
  });

  return { Dati, Dettaglio, Audit };
}
