import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { assegnaCesta } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

/**
 * POST /api/acqualatina/misuratori/cesta — assegna (o toglie) la cesta in blocco.
 *
 * Corpo: `{ ids: string[], cesta: string | null }`. Su AcquaLatina la cesta la dichiara
 * l'OPERATORE allo scarico: questa rotta è la CORREZIONE d'ufficio, per le righe arrivate
 * senza numero o con quello sbagliato. Cesta vuota/nulla = si toglie l'assegnazione. Stessa
 * platea del resto del registro: chi può avanzare gli stati può anche correggere la cesta.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; cesta?: unknown };
  return assegnaCesta('acqualatina_misuratori_rimossi', body.ids, body.cesta);
}
