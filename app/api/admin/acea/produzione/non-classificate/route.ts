import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaProduzioneEconomica } from '@/lib/produzione/load';
import { buildWorkbookNonClassificate } from '@/lib/produzione/exportNonClassificate';

export const runtime = 'nodejs';

const XLSX_HEADERS = (fileName: string) => ({
  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'Content-Disposition': `attachment; filename="${fileName}"`,
  'Cache-Control': 'no-store',
});

/** GET ?from&to (YYYY-MM-DD): scarica il dettaglio riga-per-riga degli interventi "Non classificata". */
export async function GET(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const dati = await caricaProduzioneEconomica(from, to);
    const buf = await buildWorkbookNonClassificate(dati.nonClassificate, from, to);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: XLSX_HEADERS(`Interventi-non-classificati_${from}_${to}.xlsx`),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export Excel.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
