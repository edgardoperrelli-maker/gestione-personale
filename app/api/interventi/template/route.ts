import 'server-only';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTemplateImport } from '@/lib/attivita/templateImport';

export const runtime = 'nodejs';

/** GET /api/interventi/template — template Excel con Leggenda sempre allineata alla tassonomia. */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const buf = await buildTemplateImport(await caricaTassonomia());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-interventi.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
