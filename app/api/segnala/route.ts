import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// Hub ATLAS (override via env per staging). Il segreto resta SERVER-side: il browser
// parla con questa route, la route inoltra ad ATLAS aggiungendo la chiave.
const ATLAS_REPORT_URL =
  process.env.ATLAS_REPORT_URL ?? 'https://atlas-web-six-xi.vercel.app/api/atlas/report';

const MAX_TITLE = 200;
const MAX_BODY = 10000;
const MAX_SHOT_BYTES = 4 * 1024 * 1024; // 4MB, come il tetto di ATLAS

/** Inoltra ad ATLAS aggiungendo il segreto server-side e il projectSlug FISSO. */
async function forwardToAtlas(secret: string, out: FormData): Promise<NextResponse> {
  out.set('projectSlug', 'gp'); // slug FISSO dell'app, mai dal client
  try {
    // Niente Content-Type a mano: con un body FormData lo imposta fetch (boundary multipart).
    const response = await fetch(ATLAS_REPORT_URL, {
      method: 'POST',
      headers: { 'x-atlas-report-key': secret },
      body: out,
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

/**
 * POST /api/segnala — proxy della segnalazione "invia segnalazione" verso l'hub ATLAS.
 * projectSlug è FISSO ('gp') e non arriva dal client. Richiede un utente loggato
 * (niente spam anonimo). Fail-closed se il segreto non è configurato.
 * Accetta multipart/form-data (testo + screenshot) o JSON (solo testo, retro-compat).
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const secret = process.env.ATLAS_REPORT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Segnalazioni non configurate.' }, { status: 503 });
  }

  const contentType = request.headers.get('content-type') ?? '';

  // multipart: testo + eventuale screenshot (inoltrato tale e quale ad ATLAS, che lo valida).
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
    }
    const rawTitle = form.get('title');
    const title = (typeof rawTitle === 'string' ? rawTitle : '').trim().slice(0, MAX_TITLE);
    if (!title) {
      return NextResponse.json({ error: 'Il titolo è obbligatorio.' }, { status: 400 });
    }
    const rawBody = form.get('body');
    const body = typeof rawBody === 'string' ? rawBody.trim().slice(0, MAX_BODY) : undefined;

    const out = new FormData();
    out.set('title', title);
    if (body) out.set('body', body);
    const shot = form.get('screenshot');
    if (shot && typeof shot !== 'string' && shot.size > 0) {
      if (shot.size > MAX_SHOT_BYTES) {
        return NextResponse.json({ error: 'Immagine troppo grande (max 4MB).' }, { status: 413 });
      }
      out.set('screenshot', shot);
    }
    return forwardToAtlas(secret, out);
  }

  // JSON: solo testo (retro-compatibilità con vecchi client).
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

  const out = new FormData();
  out.set('title', title);
  if (body) out.set('body', body);
  return forwardToAtlas(secret, out);
}
