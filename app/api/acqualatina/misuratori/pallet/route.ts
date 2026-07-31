import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { assegnaPallet } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

/**
 * POST /api/acqualatina/misuratori/pallet — assegna (o toglie) il pallet in blocco.
 *
 * Corpo: `{ ids: string[], pallet: string | null }`. È il gesto «cesta piena»: i misuratori
 * selezionati ricevono il numero del pallet di riferimento con cui viaggerà la riconsegna.
 * Pallet vuoto/nullo = si toglie l'assegnazione (correzione). Stessa platea del resto del
 * registro: chi può avanzare gli stati può anche impallettare.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; pallet?: unknown };
  return assegnaPallet('acqualatina_misuratori_rimossi', body.ids, body.pallet);
}
