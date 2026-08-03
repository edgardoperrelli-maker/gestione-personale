import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/**
 * GET /api/admin/audit — registro unico di Impostazioni › Log accessi e azioni.
 *
 * Unisce due fonti che vivono separate:
 *  • `audit_accessi` — vista su `auth.audit_log_entries`: login, logout, rinnovo/revoca del
 *    token, modifiche utenza. Le scrive Supabase, risalgono a ottobre 2025.
 *  • `audit_azioni` — le operazioni applicative, scritte da `lib/audit/registra.ts`.
 *
 * Entrambe leggibili al solo `service_role`: si passa di qui, mai dal browser.
 */

type Riga = {
  id: string;
  fonte: 'accesso' | 'azione';
  occorso_il: string;
  utente_id: string | null;
  utente_email: string | null;
  azione: string;
  entita: string | null;
  entita_id: string | null;
  esito: string | null;
  ip: string | null;
  dettaglio: Record<string, unknown>;
};

/**
 * Il rinnovo del token scatta a timer, non per un gesto dell'utente: da solo vale 18.000 righe
 * su 18.272 e seppellirebbe tutto il resto. Resta escluso salvo richiesta esplicita — con
 * `rumore=1` torna utile per una cosa sola: sapere chi aveva una sessione viva a una data ora.
 */
const RUMORE = ['token_refreshed', 'token_revoked'];

const LIMITE_PREDEFINITO = 100;
const LIMITE_MASSIMO = 500;

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);

  // Elenco utenze per il menu dei filtri: lo chiede il client una volta sola, all'apertura.
  if (searchParams.get('meta') === '1') {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const utenti = (data?.users ?? [])
      .map((u) => ({ id: u.id, email: u.email ?? '' }))
      .filter((u) => u.email)
      .sort((a, b) => a.email.localeCompare(b.email));
    return NextResponse.json({ utenti });
  }

  const tipo = searchParams.get('tipo') ?? 'tutto';
  const dal = searchParams.get('dal');
  const al = searchParams.get('al');
  const utente = searchParams.get('utente');
  const azione = searchParams.get('azione');
  const q = searchParams.get('q')?.trim();
  const conRumore = searchParams.get('rumore') === '1';
  const limite = Math.min(Number(searchParams.get('limit') ?? LIMITE_PREDEFINITO) || LIMITE_PREDEFINITO, LIMITE_MASSIMO);

  try {
    const vuoiAccessi = tipo === 'tutto' || tipo === 'accessi';
    const vuoiAzioni = tipo === 'tutto' || tipo === 'azioni';

    // Si pesca `limite` da ciascuna fonte e si taglia dopo la fusione: con l'ordinamento per
    // data decrescente la pagina risultante è comunque quella giusta.
    const [accessi, azioni] = await Promise.all([
      vuoiAccessi ? leggiAccessi({ dal, al, utente, azione, q, conRumore, limite }) : Promise.resolve([]),
      vuoiAzioni ? leggiAzioni({ dal, al, utente, azione, q, limite }) : Promise.resolve([]),
    ]);

    const righe = [...accessi, ...azioni]
      .sort((a, b) => b.occorso_il.localeCompare(a.occorso_il))
      .slice(0, limite);

    return NextResponse.json({ righe, troncato: accessi.length + azioni.length > righe.length });
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : 'Errore lettura registro.';
    console.error('[GET /api/admin/audit]', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}

type Filtri = {
  dal: string | null;
  al: string | null;
  utente: string | null;
  azione: string | null;
  q?: string;
  limite: number;
};

async function leggiAccessi({ dal, al, utente, azione, q, conRumore, limite }: Filtri & { conRumore: boolean }): Promise<Riga[]> {
  let query = supabaseAdmin
    .from('audit_accessi')
    .select('id, occorso_il, utente_id, utente_email, azione, ip, dettaglio')
    .order('occorso_il', { ascending: false })
    .limit(limite);

  if (dal) query = query.gte('occorso_il', dal);
  if (al) query = query.lte('occorso_il', al);
  if (utente) query = query.eq('utente_email', utente);
  if (azione) query = query.eq('azione', azione);
  if (!conRumore) query = query.not('azione', 'in', `(${RUMORE.join(',')})`);
  if (q) query = query.or(`utente_email.ilike.%${q}%,azione.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(`accessi: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: `acc:${String(r.id)}`,
    fonte: 'accesso' as const,
    occorso_il: String(r.occorso_il),
    utente_id: (r.utente_id as string | null) ?? null,
    utente_email: (r.utente_email as string | null) ?? null,
    azione: String(r.azione ?? ''),
    entita: null,
    entita_id: null,
    esito: null,
    ip: (r.ip as string | null) ?? null,
    dettaglio: (r.dettaglio as Record<string, unknown>) ?? {},
  }));
}

async function leggiAzioni({ dal, al, utente, azione, q, limite }: Filtri): Promise<Riga[]> {
  let query = supabaseAdmin
    .from('audit_azioni')
    .select('id, occorso_il, utente_id, utente_email, azione, entita, entita_id, esito, ip, dettaglio')
    .order('occorso_il', { ascending: false })
    .limit(limite);

  if (dal) query = query.gte('occorso_il', dal);
  if (al) query = query.lte('occorso_il', al);
  if (utente) query = query.eq('utente_email', utente);
  if (azione) query = query.eq('azione', azione);
  if (q) query = query.or(`utente_email.ilike.%${q}%,azione.ilike.%${q}%,entita_id.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(`azioni: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: `azi:${String(r.id)}`,
    fonte: 'azione' as const,
    occorso_il: String(r.occorso_il),
    utente_id: (r.utente_id as string | null) ?? null,
    utente_email: (r.utente_email as string | null) ?? null,
    azione: String(r.azione ?? ''),
    entita: (r.entita as string | null) ?? null,
    entita_id: (r.entita_id as string | null) ?? null,
    esito: (r.esito as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    dettaglio: (r.dettaglio as Record<string, unknown>) ?? {},
  }));
}
