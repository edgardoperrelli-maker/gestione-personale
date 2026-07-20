import 'server-only';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { toDDMMYYYY } from '@/lib/rapportini/exportStandard';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─── Tipi locali ──────────────────────────────────────────────────────────────

type RapRow = {
  id: string;
  staff_name: string | null;
  staff_id: string | null;
  data: string | null;
  stato: string | null;
  piano_id: string | null;
  campi_snapshot: unknown;
};

type VoceRow = {
  id: string;
  rapportino_id: string;
  ordine: number | null;
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  recapito: string | null;
  attivita: string | null;
  accessibilita: string | null;
  fascia_oraria: string | null;
  risposte: Record<string, unknown> | null;
  manuale: boolean | null;
  campi_snapshot?: unknown;
};

function safeStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function labelStato(stato: string | null): string {
  if (stato === 'inviato') return 'Inviato';
  if (stato === 'in_corso') return 'In corso';
  if (stato === 'scaduto') return 'Scaduto';
  return stato ?? '—';
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const from = searchParams.get('from') ?? defaultFrom;
  const to = searchParams.get('to') ?? now.toISOString().slice(0, 10);
  const territorioFiltro = searchParams.get('territorio') ?? '';
  const operatoreFiltro = searchParams.get('operatore') ?? '';

  try {
    // ── 1. Rapportini nel range ─────────────────────────────────────────────
    let rapQuery = supabaseAdmin
      .from('rapportini')
      .select('id, staff_name, staff_id, data, stato, piano_id, campi_snapshot')
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: true })
      .order('staff_name', { ascending: true });
    if (operatoreFiltro) rapQuery = rapQuery.eq('staff_id', operatoreFiltro);

    const { data: raps, error: rErr } = await rapQuery;
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    let rapList = (raps ?? []) as RapRow[];

    // ── 2. Territorio → filtra per piano ──────────────────────────────────
    const pianoIds = [...new Set(rapList.map((r) => r.piano_id).filter(Boolean))] as string[];
    const territorioByPiano: Record<string, string> = {};
    if (pianoIds.length) {
      const { data: piani } = await supabaseAdmin
        .from('mappa_piani')
        .select('id, territorio')
        .in('id', pianoIds);
      for (const p of (piani ?? []) as Array<{ id: string; territorio: string | null }>) {
        territorioByPiano[p.id] = p.territorio ?? '';
      }
    }
    if (territorioFiltro) {
      rapList = rapList.filter(
        (r) => (territorioByPiano[r.piano_id ?? ''] ?? '') === territorioFiltro,
      );
    }

    if (rapList.length === 0) {
      return NextResponse.json({ error: 'Nessun rapportino nel range selezionato.' }, { status: 404 });
    }

    // ── 3. Unione dei campi template (escludi tipo='foto' dall'export testo) ─
    //       Le foto non sono valori leggibili; se presenti mostriamo solo "✓".
    const campiMap = new Map<string, { chiave: string; etichetta: string; tipo: string; ordine: number }>();
    for (const r of rapList) {
      const campi = ((r.campi_snapshot ?? []) as TemplateCampo[]).sort(
        (a, b) => (a.ordine ?? 0) - (b.ordine ?? 0),
      );
      for (const c of campi) {
        if (!campiMap.has(c.chiave)) {
          campiMap.set(c.chiave, {
            chiave: c.chiave,
            etichetta: c.etichetta,
            tipo: c.tipo,
            ordine: c.ordine ?? 0,
          });
        }
      }
    }
    // ── 4. Voci di tutti i rapportini ─────────────────────────────────────
    const rapIds = rapList.map((r) => r.id);
    const vociByRap = new Map<string, VoceRow[]>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data: voci, error: vErr } = await supabaseAdmin
        .from('rapportino_voci')
        .select(
          'id, rapportino_id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte, manuale, campi_snapshot',
        )
        .in('rapportino_id', rapIds)
        .order('ordine', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
      const batch = (voci ?? []) as VoceRow[];
      for (const v of batch) {
        const arr = vociByRap.get(v.rapportino_id) ?? [];
        arr.push(v);
        vociByRap.set(v.rapportino_id, arr);
        // Voci per-attività: i campi del flusso della voce entrano nell'unione delle colonne.
        for (const c of (Array.isArray(v.campi_snapshot) ? (v.campi_snapshot as TemplateCampo[]) : [])) {
          if (!campiMap.has(c.chiave)) {
            campiMap.set(c.chiave, { chiave: c.chiave, etichetta: c.etichetta, tipo: c.tipo, ordine: c.ordine ?? 0 });
          }
        }
      }
      if (batch.length < PAGE) break;
    }

    const campiUniti = [...campiMap.values()].sort(
      (a, b) => a.ordine - b.ordine || a.etichetta.localeCompare(b.etichetta, 'it'),
    );

    // ── 5. Costruisce il workbook ─────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gestione Personale';
    wb.created = new Date();

    const ws = wb.addWorksheet('Interventi', { views: [{ state: 'frozen', ySplit: 1 }] });

    // Colonne fisse + dinamiche
    const COL_FISSI = [
      { key: 'data',          header: 'DATA',            width: 12 },
      { key: 'operatore',     header: 'OPERATORE',       width: 20 },
      { key: 'territorio',    header: 'TERRITORIO',      width: 18 },
      { key: 'stato',         header: 'STATO',           width: 12 },
      { key: 'n',             header: 'N°',              width: 5  },
      { key: 'nominativo',    header: 'NOMINATIVO',      width: 22 },
      { key: 'matricola',     header: 'MATRICOLA',       width: 14 },
      { key: 'pdr',           header: 'PDR',             width: 14 },
      { key: 'odl',           header: 'ODL',             width: 14 },
      { key: 'via',           header: 'VIA',             width: 24 },
      { key: 'comune',        header: 'COMUNE',          width: 16 },
      { key: 'cap',           header: 'CAP',             width: 7  },
      { key: 'recapito',      header: 'RECAPITO',        width: 14 },
      { key: 'attivita',      header: 'ATTIVITÀ',        width: 16 },
      { key: 'accessibilita', header: 'ACCESSIBILITÀ',   width: 16 },
      { key: 'fascia_oraria', header: 'FASCIA ORARIA',   width: 16 },
    ];
    const COL_DINAMICI = campiUniti.map((c) => ({
      key: `campo_${c.chiave}`,
      header: c.etichetta.toUpperCase(),
      width: Math.max(12, Math.min(30, c.etichetta.length + 4)),
    }));
    const COL_EXTRA = [{ key: 'manuale', header: 'MANUALE', width: 10 }];

    ws.columns = [...COL_FISSI, ...COL_DINAMICI, ...COL_EXTRA];

    // Stile intestazione
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F2749' }, // navy
    };
    const hRow = ws.getRow(1);
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = headerFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF2563EB' } },
      };
    });
    hRow.height = 20;
    hRow.commit();

    // Divisore visivo tra colonne fisse e dinamiche (sfondo leggermente diverso)
    if (campiUniti.length > 0) {
      const firstDynIdx = COL_FISSI.length + 1; // 1-based
      const lastDynIdx = COL_FISSI.length + campiUniti.length;
      for (let ci = firstDynIdx; ci <= lastDynIdx; ci++) {
        const cell = hRow.getCell(ci);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
      }
      hRow.commit();
    }

    // Righe dati
    let rowIdx = 2;
    for (const rap of rapList) {
      const territorio = territorioByPiano[rap.piano_id ?? ''] ?? '';
      const stato = labelStato(rap.stato);
      const vociRap = vociByRap.get(rap.id) ?? [];

      for (const v of vociRap) {
        const risposte = (v.risposte ?? {}) as Record<string, unknown>;
        const row: Record<string, unknown> = {
          data: toDDMMYYYY(rap.data),
          operatore: safeStr(rap.staff_name),
          territorio,
          stato,
          n: v.ordine ?? '',
          nominativo: safeStr(v.nominativo),
          matricola: safeStr(v.matricola),
          pdr: safeStr(v.pdr),
          odl: safeStr(v.odl),
          via: safeStr(v.via),
          comune: safeStr(v.comune),
          cap: safeStr(v.cap),
          recapito: safeStr(v.recapito),
          attivita: safeStr(v.attivita),
          accessibilita: safeStr(v.accessibilita),
          fascia_oraria: safeStr(v.fascia_oraria),
          manuale: v.manuale ? 'Sì' : 'No',
        };
        for (const c of campiUniti) {
          const val = risposte[c.chiave];
          let cell: string;
          if (c.tipo === 'foto') {
            cell = typeof val === 'string' && val ? '✓' : '';
          } else if (c.tipo === 'crocetta') {
            cell = val === true ? 'X' : val === false ? '' : safeStr(val);
          } else {
            cell = val == null ? '' : String(val);
          }
          row[`campo_${c.chiave}`] = cell;
        }

        const wsRow = ws.getRow(rowIdx);
        // Assegnazione per chiave (NON per array): evita lo shift di colonna
        // che ExcelJS causa con array e offset interno index+1.
        wsRow.values = row as Record<string, ExcelJS.CellValue>;
        // Riga alternata (leggibilità) — applica a tutte le celle della riga
        if (rowIdx % 2 === 0) {
          const nCols = COL_FISSI.length + campiUniti.length + COL_EXTRA.length;
          for (let ci = 1; ci <= nCols; ci++) {
            wsRow.getCell(ci).fill = {
              type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FA' },
            };
          }
        }
        // Bordo sinistro verde per righe "inviato"
        if (rap.stato === 'inviato') {
          wsRow.getCell(1).border = { left: { style: 'medium', color: { argb: 'FF16A34A' } } };
        }
        wsRow.commit();
        rowIdx++;
      }
    }

    // Auto-fit larghezza (raffina rispetto ai default)
    ws.columns.forEach((col) => {
      let max = (col.header as string)?.length ?? 8;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const s = cell.value == null ? '' : String(cell.value);
        if (s.length > max) max = s.length;
      });
      col.width = Math.max(col.width ?? 8, Math.min(40, max + 2));
    });

    // Numero totale righe / info di riepilogo
    ws.getCell(`A${rowIdx + 1}`).value = `Estratto il ${new Date().toLocaleDateString('it-IT')} · ${rowIdx - 2} interventi · dal ${toDDMMYYYY(from)} al ${toDDMMYYYY(to)}`;
    ws.getCell(`A${rowIdx + 1}`).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };

    const buf = await wb.xlsx.writeBuffer();
    const fromSlug = from.replaceAll('-', '');
    const toSlug = to.replaceAll('-', '');
    const fileName = `INTERVENTI_${fromSlug}_${toSlug}.xlsx`;

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
