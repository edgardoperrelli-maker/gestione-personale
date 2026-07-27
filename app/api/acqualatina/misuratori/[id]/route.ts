import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { aggiornaRegistro } from '@/lib/misuratori/registro';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  return aggiornaRegistro('acqualatina_misuratori_rimossi', id, body, auth.user.app_metadata);
}
