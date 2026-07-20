// GET /api/interventi/riconciliazione — lista interventi flaggati da_riconciliare (admin_plus).
// Doppio esito sullo stesso ODL: vedi lib/interventi/odlPositivi.ts.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAssignableRole, canManageUsers } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdminPlus(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  if (!canManageUsers(role)) return NextResponse.json({ error: 'Riservato agli Admin Plus.' }, { status: 403 });
  return true;
}

type InterventoRow = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  data: string | null;
  staff_id: string | null;
  riconciliazione_rif_id: string | null;
};

export type RigaRiconciliazione = {
  id: string;
  odl: string | null;
  matricola: string | null;
  comune: string | null;
  indirizzo: string | null;
  data: string | null;
  esecutore: string | null;
  originale: { id: string; data: string | null; esecutore: string | null } | null;
};

export async function GET() {
  const guard = await requireAdminPlus();
  if (guard instanceof NextResponse) return guard;

  const { data, error } = await supabaseAdmin
    .from('interventi')
    .select('id, odl, matricola_contatore, comune, indirizzo, data, staff_id, riconciliazione_rif_id')
    .eq('da_riconciliare', true)
    .order('data', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const righe = (data ?? []) as InterventoRow[];

  const rifIds = [...new Set(righe.map((r) => r.riconciliazione_rif_id).filter((x): x is string => !!x))];
  const originali = new Map<string, { data: string | null; staff_id: string | null }>();
  if (rifIds.length > 0) {
    const { data: rifRows } = await supabaseAdmin
      .from('interventi')
      .select('id, data, staff_id')
      .in('id', rifIds);
    for (const r of (rifRows ?? []) as Array<{ id: string; data: string | null; staff_id: string | null }>) {
      originali.set(r.id, { data: r.data, staff_id: r.staff_id });
    }
  }

  const staffIds = [
    ...new Set([...righe.map((r) => r.staff_id), ...[...originali.values()].map((o) => o.staff_id)].filter(
      (x): x is string => !!x,
    )),
  ];
  const staffById = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name').in('id', staffIds);
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) staffById.set(s.id, s.display_name);
  }

  const risultato: RigaRiconciliazione[] = righe.map((r) => {
    const orig = r.riconciliazione_rif_id ? originali.get(r.riconciliazione_rif_id) : null;
    return {
      id: r.id,
      odl: r.odl,
      matricola: r.matricola_contatore,
      comune: r.comune,
      indirizzo: r.indirizzo,
      data: r.data,
      esecutore: r.staff_id ? (staffById.get(r.staff_id) ?? null) : null,
      originale:
        orig && r.riconciliazione_rif_id
          ? {
              id: r.riconciliazione_rif_id,
              data: orig.data,
              esecutore: orig.staff_id ? (staffById.get(orig.staff_id) ?? null) : null,
            }
          : null,
    };
  });

  return NextResponse.json({ righe: risultato });
}
