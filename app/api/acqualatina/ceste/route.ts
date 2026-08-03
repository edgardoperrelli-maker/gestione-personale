import { NextResponse } from 'next/server';
import { requireAdmin, requireUser } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { configCeste } from '@/lib/acqualatina/scaricoMisuratori';

export const runtime = 'nodejs';

/**
 * L'intervallo delle ceste di magazzino AcquaLatina.
 *
 * «Le ceste sono numerate da X a Y» è un dato del MAGAZZINO: cambia quando si aggiunge una fila
 * di ceste, e cambiarlo non può costare un deploy. Lettura a chiunque sia autenticato (serve al
 * registro), scrittura ai soli admin — è una configurazione di commessa.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await configCeste());
}

/** Intero >= 1 oppure `null`. Qualunque altra cosa è `undefined` = valore rifiutato. */
function estremo(v: unknown): number | null | undefined {
  if (v === null || v === '' || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

/** PUT — `{ numeroMin, numeroMax }`. Entrambi nulli = «non configurato», campo libero. */
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { numeroMin?: unknown; numeroMax?: unknown };
  const min = estremo(body.numeroMin);
  const max = estremo(body.numeroMax);
  if (min === undefined || max === undefined) {
    return NextResponse.json({ error: 'Le ceste si numerano con interi da 1 in su.' }, { status: 400 });
  }
  // O tutt'e due o nessuno: un solo estremo non descrive un intervallo, e lasciare che la UI
  // indovini l'altro è il modo di far comparire un menu che nessuno ha configurato.
  if ((min === null) !== (max === null)) {
    return NextResponse.json({ error: 'Servono ENTRAMBI gli estremi, oppure nessuno dei due.' }, { status: 400 });
  }
  if (min !== null && max !== null && max < min) {
    return NextResponse.json({ error: 'La cesta finale non può venire prima di quella iniziale.' }, { status: 400 });
  }

  // `upsert` e non `update`: la riga la crea la migration, ma un ambiente ripulito a mano non
  // deve lasciare la configurazione senza posto dove atterrare.
  const { error } = await supabaseAdmin
    .from('acqualatina_ceste')
    .upsert({ id: true, numero_min: min, numero_max: max }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, numeroMin: min, numeroMax: max });
}
