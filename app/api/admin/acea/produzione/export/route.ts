import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaProduzioneEconomica } from '@/lib/produzione/load';
import { buildWorkbookProduzione } from '@/lib/produzione/exportExcel';

export const runtime = 'nodejs';

/** GET ?from&to (YYYY-MM-DD): scarica il workbook "Produzione economica ACEA" (Dashboard + Dati). */
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
    const buf = await buildWorkbookProduzione(dati);
    const fileName = `Produzione-economica-ACEA_${from}_${to}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export Excel.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
