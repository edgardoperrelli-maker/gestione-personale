import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// Hub ATLAS (override via env per staging). Il segreto resta SERVER-side: il browser
// parla con questa route, la route inoltra ad ATLAS aggiungendo la chiave.
const ATLAS_REPORT_URL =
  process.env.ATLAS_REPORT_URL ?? 'https://atlas-web-six-xi.vercel.app/api/atlas/report';

const MAX_TITLE = 200;
const MAX_BODY = 10000;

/**
 * POST /api/segnala — proxy della segnalazione "invia segnalazione" verso l'hub ATLAS.
 * projectSlug è FISSO ('gp') e non arriva dal client. Richiede un utente loggato
 * (niente spam anonimo). Fail-closed se il segreto non è configurato.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const secret = process.env.ATLAS_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Segnalazioni non configurate.' }, { status: 503 });
  }

  let payload: { title?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const title = String(payload.title ?? '').trim().slice(0, MAX_TITLE);
  const body = payload.body == null ? undefined : String(payload.body).trim().slice(0, MAX_BODY);
  if (!title) {
    return NextResponse.json({ error: 'Il titolo è obbligatorio.' }, { status: 400 });
  }

  try {
    const response = await fetch(ATLAS_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-atlas-report-key': secret },
      body: JSON.stringify({ projectSlug: 'gp', title, body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Invio non riuscito.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invio non riuscito.' }, { status: 502 });
  }
}
