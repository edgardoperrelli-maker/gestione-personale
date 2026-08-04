import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { assegnaCesta } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

/**
 * POST /api/misuratori/cesta — assegna (o toglie) la cesta in blocco sul registro ACEA.
 *
 * Gemello esatto di quello AcquaLatina, stessa funzione condivisa sotto: si selezionano i
 * misuratori finiti nella stessa cesta e si scrive su tutti il numero con cui la riconsegna
 * viaggia. Qui non c'è uno scarico da campo a dichiararla: la cesta la scrive l'ufficio.
 *
 * Corpo: `{ ids: string[], cesta: string | null }`. Cesta vuota/nulla TOGLIE l'assegnazione
 * (correzione di un errore): l'assenza è uno stato legittimo, «non ancora scaricato». Stessa
 * platea del resto del registro — chi può avanzare gli stati può anche assegnare la cesta.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; cesta?: unknown };
  return assegnaCesta('misuratori_rimossi', body.ids, body.cesta);
}
