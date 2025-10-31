import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const norm = (s: any) => String(s ?? "").trim().toUpperCase();

// alias tolleranti (coerenti col tuo foglio)
const ALIAS = [
  { tipo: "SETTIMANALE",   keys: ["SETTIMANALE", "SCADENZA MANUTENZIONE SETTIMANALE"] },
  { tipo: "BISETTIMANALE", keys: ["BISETTIMANALE", "QUINDICINALE", "SCADENZA MANUTENZIONE BISETTIMANALE"] },
  { tipo: "MENSILE",       keys: ["MESE", "MENSILE", "SCADENZA MANUTENZIONE MENSILE"] },
  { tipo: "TRIMESTRALE",   keys: ["TRIMESTRALE", "TRIMESTRALI", "SCADENZA MANUTENZIONE TRIMESTRALE"] },
  { tipo: "SEMESTRALE",    keys: ["SEMESTRALE", "SEMESTRALI", "SCADENZA MANUTENZIONE SEMESTRALE"] },
  { tipo: "ANNUALE",       keys: ["ANNUALE", "SCADENZA MANUTENZIONE ANNUALE"] },
  { tipo: "BIENNALE",      keys: ["BIENNALE", "BIANNUALE", "SCADENZA MANUTENZIONE BIANNUALE"] },
  { tipo: "COLLAUDO",      keys: ["COLLAUDO", "SCADENZA COLLAUDO"] },
];

function tzTodayRome() {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()); // "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const fmt = (d: Date) => {
  if (!(d instanceof Date) || isNaN(+d)) return "-";
  return d.toLocaleDateString("it-IT");
};

// Parser robusto: Excel seriale, Date nativa, stringa DD/MM/YYYY o DD-MM-YYYY
function parseExcelDate(v: any): Date | null {
  if (!v && v !== 0) return null;

  if (v instanceof Date && !isNaN(+v)) {
    const d = new Date(v); d.setHours(0,0,0,0); return d;
  }
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400000); // Excel epoch 1899-12-30
    const d = new Date(ms); d.setHours(0,0,0,0); return isNaN(+d) ? null : d;
  }
  if (typeof v === "string") {
    const s = v.trim();
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd); d.setHours(0,0,0,0);
      return isNaN(+d) ? null : d;
    }
  }
  return null;
}

// ===== helper per Excel allegato =====
function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

type XRow = {
  Gruppo: string;      // SCADUTO | OGGI | +N
  Data: string;        // dd/mm/yyyy
  Offset: number;      // giorni da oggi
  Reminder: string;    // "", "+1", "+3", "+7"
  Periodicità: string; // TIPO
  Colonna: string;     // intestazione reale
  Codice?: string;
  Categoria?: string;
  Descrizione?: string;
  Modello?: string;
  Matricola?: string;
  Assegnato?: string;
};

export async function GET() {
  try {
    // Gate: esegui invio solo alle 07:00 Europe/Rome
if (process.env.CRON_ENFORCE_TIME === "1") {
  const hh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date()));
  if (hh !== 7) return NextResponse.json({ ok: true, skipped: `hour=${hh}` });
}


    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const bucket      = process.env.ATTREZZATURE_BUCKET || "attrezzature";
    const key         = process.env.ATTREZZATURE_MASTER_KEY || "master.xlsx";

    const sb = createClient(supabaseUrl, serviceKey);
    const { data, error } = await sb.storage.from(bucket).download(key);
    if (error) {
      return NextResponse.json({ ok:false, error:`Download master fallito: ${error.message}`, hint:`bucket=${bucket} key=${key}` }, { status: 500 });
    }

    const wb = XLSX.read(new Uint8Array(await data.arrayBuffer()), {
      type: "array",
      cellDates: true,
      raw: false
    });

    const sheetName =
      wb.SheetNames.find(n => n.toUpperCase().includes("ATTREZZATURA")) ||
      wb.SheetNames[0];

    const raw: Row[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });

    // mappa colonne presenti -> tipo periodicità
    const headers = Object.keys(raw[0] ?? {}).map(norm);
    const colToTipo = new Map<string,string>();
    for (const h of headers) {
      for (const a of ALIAS) {
        if (a.keys.map(norm).some(k => h.includes(k))) colToTipo.set(h, a.tipo);
      }
    }

    const today = tzTodayRome();
    const plus = (n:number) => { const d = new Date(today); d.setDate(d.getDate()+n); return d; };

    type Hit = {
      DATA: Date;
      OFFSET: number;   // <0 scaduti, 0 oggi, 1..7 prossimi
      TIPO: string;
      COLONNA: string;
      CATEGORIA?: string;
      DESCRIZIONE?: string;
      MODELLO?: string;
      MATRICOLA?: string;
      CODICE?: string;
      ASSEGNATO?: string;
    };

    const hits: Hit[] = [];

    for (const r of raw) {
const base = {
  CATEGORIA: String(r["CATEGORIA"] ?? ""),
  DESCRIZIONE: String(r["DESCRIZIONE"] ?? ""),
  MODELLO: String(r["MODELLO"] ?? ""),
  MATRICOLA: String(r[" MATRICOLA"] ?? r["MATRICOLA"] ?? ""),
  CODICE: String(r["CODICE"] ?? ""),
  ASSEGNATO: String(r["ASSEGNATO"] ?? ""),
};


      for (const k of Object.keys(r)) {
        const kN = norm(k);
        const tipo = colToTipo.get(kN);
        if (!tipo) continue;

        const d = parseExcelDate(r[k]);
        if (!d) continue;

        const offset = Math.round((+d - +today) / 86400000);
        if (offset <= 7) {
          hits.push({ DATA: d, OFFSET: offset, TIPO: tipo, COLONNA: k, ...base });
        }
      }
    }

    // group: scadute + per giorno 0..7
    const scaduti = hits.filter(h => h.OFFSET < 0).sort((a,b) => a.DATA.getTime()-b.DATA.getTime());
    const byDay = new Map<number, Hit[]>();
    for (let d=0; d<=7; d++) byDay.set(d, []);
    hits.filter(h => h.OFFSET >= 0 && h.OFFSET <= 7).forEach(h => byDay.get(h.OFFSET)!.push(h));
  for (const d of byDay.keys()) byDay.get(d)!.sort((a,b) =>
  String(a.TIPO ?? "").localeCompare(String(b.TIPO ?? "")) ||
  String(a.CATEGORIA ?? "").localeCompare(String(b.CATEGORIA ?? "")) ||
  String(a.DESCRIZIONE ?? "").localeCompare(String(b.DESCRIZIONE ?? "")) ||
  String(a.CODICE ?? "").localeCompare(String(b.CODICE ?? ""))
);


    // ===== prepara righe per Excel PRIMA dell'email =====
    const xrows: XRow[] = [];
    const pushRow = (grp: string, h: Hit, dOff: number) => {
      const rem = (dOff===1||dOff===3||dOff===7) ? `+${dOff}` : "";
      xrows.push({
        Gruppo: grp,
        Data: ddmmyyyy(h.DATA),
        Offset: dOff,
        Reminder: rem,
        Periodicità: h.TIPO,
        Colonna: String(h.COLONNA),
        Codice: h.CODICE || "",
        Categoria: h.CATEGORIA || "",
        Descrizione: h.DESCRIZIONE || "",
        Modello: h.MODELLO || "",
        Matricola: h.MATRICOLA || "",
        Assegnato: h.ASSEGNATO || "",
      });
    };
    for (const h of scaduti) pushRow("SCADUTO", h, h.OFFSET);
    for (let d=0; d<=7; d++) for (const h of byDay.get(d)!) pushRow(d===0?"OGGI":`+${d}`, h, d);

    // corpo email
    const lines: string[] = [];
    lines.push(`Riepilogo scadenze attrezzature al ${fmt(today)} — scadute + prossimi 7 giorni`);
    lines.push(`Promemoria evidenziati a +1, +3, +7 giorni.`);
    lines.push("");

    lines.push(`SCADUTE (prima di oggi): ${scaduti.length}`);
    for (const h of scaduti) {
      const giorni = Math.abs(h.OFFSET);
      lines.push(` - [SCADUTO da ${giorni}g] [${h.TIPO}] col: “${h.COLONNA}” | ${h.CATEGORIA} | ${h.DESCRIZIONE} ${h.MODELLO} | Matricola: ${h.MATRICOLA} | Codice: ${h.CODICE} | Assegnato: ${h.ASSEGNATO} | Data: ${fmt(h.DATA)}`);
    }
    lines.push("");

    for (let d=0; d<=7; d++) {
      const arr = byDay.get(d)!;
      const ref = plus(d);
      const flag = (d===1||d===3||d===7) ? " • PROMEMORIA" : "";
      const header = d===0 ? `OGGI ${fmt(ref)}` : `${d} giorni → ${fmt(ref)}`;
      lines.push(`${header}: ${arr.length} elemento/i${flag}`);
 for (const h of arr) {
  lines.push(
    ` - [${String(h.TIPO ?? "")}] ${String(h.CATEGORIA ?? "")} | ${String(h.DESCRIZIONE ?? "")} ${String(h.MODELLO ?? "")} | Matricola: ${String(h.MATRICOLA ?? "")} | Codice: ${String(h.CODICE ?? "")} | Assegnato: ${String(h.ASSEGNATO ?? "")} | Scadenza: ${fmt(h.DATA)}`
  );
}

      lines.push("");
    }
    const body = lines.join("\n");

    // crea Excel allegato
    const wbOut = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(xrows, { header: [
      "Gruppo","Data","Offset","Reminder","Periodicità","Colonna",
      "Codice","Categoria","Descrizione","Modello","Matricola","Assegnato"
    ]});
    (ws as any)['!cols'] = [
      {wch:10},{wch:12},{wch:7},{wch:9},{wch:12},{wch:20},
      {wch:12},{wch:18},{wch:28},{wch:16},{wch:14},{wch:16}
    ];
    XLSX.utils.book_append_sheet(wbOut, ws, "Scadenze");
    const xlsxBuffer: Buffer = XLSX.write(wbOut, { type: "buffer", bookType: "xlsx" });
    const todayStr = fmt(today).replace(/\//g,'-');
    const attachName = `scadenze_${todayStr}.xlsx`;

    // invio email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"${process.env.ALERT_FROM_NAME || "Plenzich – Gestione Attrezzature (no-reply)"}" <${process.env.SMTP_USER}>`,
      to: process.env.ALERT_TO,
      replyTo: process.env.ALERT_REPLY_TO || process.env.ALERT_TO,
      subject: `Scadenze attrezzature • ${fmt(today)} • scadute + prossimi 7 giorni`,
      text: body,
      attachments: [
        { filename: attachName, content: xlsxBuffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      ]
    });

    return NextResponse.json({ ok:true, sent:true, total: hits.length, scadute: scaduti.length, exported: xrows.length });
} catch (err: any) {
  console.error("Errore in /api/attrezzature/scadenze:", err);
  return NextResponse.json({
    ok: false,
    error: String(err?.message || err),
    stack: err?.stack || "no stack"
  }, { status: 500 });
}

}
