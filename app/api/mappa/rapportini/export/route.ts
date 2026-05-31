import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildRapportinoStandardXlsx,
  buildRapportinoGenericXlsx,
  isStandardSnapshot,
  toDDMMYYYY,
  type RapportinoRow,
  type RapportinoVoce,
} from '@/lib/rapportini/exportStandard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const VOCI_COLS =
  'ordine, nominativo, matricola, pdr, odsin, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte';
const RAP_COLS = 'id, staff_name, data, campi_snapshot, template_id';

/** Slug ASCII-safe per nomi file / fogli (rimuove caratteri non validi). */
function slug(s: string): string {
  return (s || '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'rapportino';
}

function fileNameFor(rap: RapportinoRow): string {
  const staff = slug(rap.staff_name ?? '');
  const data = toDDMMYYYY(rap.data).replaceAll('/', '-') || 'data';
  return `RAPPORTINO_${staff}_${data}.xlsx`;
}

async function buildXlsxFor(
  rap: RapportinoRow,
  voci: RapportinoVoce[],
): Promise<Buffer> {
  return isStandardSnapshot(rap.campi_snapshot)
    ? buildRapportinoStandardXlsx(rap, voci)
    : buildRapportinoGenericXlsx(rap, voci);
}

async function loadVoci(rapportinoId: string): Promise<RapportinoVoce[]> {
  const { data, error } = await supabaseAdmin
    .from('rapportino_voci')
    .select(VOCI_COLS)
    .eq('rapportino_id', rapportinoId)
    .order('ordine', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RapportinoVoce[];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rapportinoId = url.searchParams.get('rapportinoId');
    const pianoId = url.searchParams.get('pianoId');

    if (!rapportinoId && !pianoId) {
      return NextResponse.json(
        { error: 'Specificare rapportinoId oppure pianoId.' },
        { status: 400 },
      );
    }

    // ── Singolo rapportino → xlsx ─────────────────────────────────────────────
    if (rapportinoId) {
      const { data: rap, error } = await supabaseAdmin
        .from('rapportini')
        .select(RAP_COLS)
        .eq('id', rapportinoId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!rap) return NextResponse.json({ error: 'Rapportino non trovato.' }, { status: 404 });

      const voci = await loadVoci(rapportinoId);
      const buf = await buildXlsxFor(rap as RapportinoRow, voci);
      const filename = fileNameFor(rap as RapportinoRow);

      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': XLSX_MIME,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buf.length),
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── Intero piano → zip di tutti i rapportini ──────────────────────────────
    const { data: raps, error } = await supabaseAdmin
      .from('rapportini')
      .select(RAP_COLS)
      .eq('piano_id', pianoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!raps || raps.length === 0) {
      return NextResponse.json({ error: 'Nessun rapportino per il piano.' }, { status: 404 });
    }

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const rap of raps as RapportinoRow[] & { id: string }[]) {
      const voci = await loadVoci((rap as { id: string }).id);
      const buf = await buildXlsxFor(rap, voci);
      // evita collisioni di nome (es. operatori omonimi)
      let name = fileNameFor(rap);
      let n = 2;
      while (usedNames.has(name)) {
        name = name.replace(/\.xlsx$/, `_${n}.xlsx`);
        n++;
      }
      usedNames.add(name);
      zip.file(name, buf);
    }

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const dataSlug =
      toDDMMYYYY((raps[0] as RapportinoRow).data).replaceAll('/', '-') || 'piano';
    const zipName = `RAPPORTINI_${dataSlug}.zip`;

    return new NextResponse(zipBuf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length': String(zipBuf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
