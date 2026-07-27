import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { leggiRegistro } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

/** Registro misuratori rimossi della commessa AcquaLatina. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return leggiRegistro('acqualatina_misuratori_rimossi', req.url);
}
