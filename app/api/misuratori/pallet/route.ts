import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { assegnaPallet } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

/**
 * POST /api/misuratori/pallet — assegna (o toglie) il pallet in blocco sul registro ACEA.
 *
 * Gemello esatto di quello AcquaLatina, stessa funzione condivisa sotto: il ciclo fisico è lo
 * stesso — a cesta piena si selezionano i misuratori che ci sono finiti dentro e si scrive su
 * tutti il numero del pallet con cui la riconsegna viaggia.
 *
 * Corpo: `{ ids: string[], pallet: string | null }`. Pallet vuoto/nullo TOGLIE l'assegnazione
 * (correzione di un errore): l'assenza è uno stato legittimo, «ancora in cesta». Stessa platea
 * del resto del registro — chi può avanzare gli stati può anche impallettare.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; pallet?: unknown };
  return assegnaPallet('misuratori_rimossi', body.ids, body.pallet);
}
