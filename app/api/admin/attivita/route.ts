import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

type ActivityRow = {
  id: string;
  name: string;
  active: boolean | null;
  created_at: string | null;
};

type ActivityUsage = {
  assignments: number;
  sopralluoghiDataset: number;
  sopralluoghiPdf: number;
  total: number;
};

type ActivityWithUsage = ActivityRow & {
  usage: ActivityUsage;
};

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  }

  return true;
}

function normalizeName(value: unknown): string | null {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return normalized || null;
}

async function getActivityUsage(activityId: string): Promise<ActivityUsage> {
  const [assignments, sopralluoghiDataset, sopralluoghiPdf] = await Promise.all([
    supabaseAdmin
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', activityId),
    supabaseAdmin
      .from('civici_napoli')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', activityId),
    supabaseAdmin
      .from('sopralluoghi_pdf_generati')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', activityId),
  ]);

  const firstError = assignments.error ?? sopralluoghiDataset.error ?? sopralluoghiPdf.error;
  if (firstError) throw new Error(firstError.message);

  const usage = {
    assignments: assignments.count ?? 0,
    sopralluoghiDataset: sopralluoghiDataset.count ?? 0,
    sopralluoghiPdf: sopralluoghiPdf.count ?? 0,
  };

  return {
    ...usage,
    total: usage.assignments + usage.sopralluoghiDataset + usage.sopralluoghiPdf,
  };
}

async function addUsage(rows: ActivityRow[]): Promise<ActivityWithUsage[]> {
  return Promise.all(rows.map(async (row) => ({ ...row, usage: await getActivityUsage(row.id) })));
}

async function assertUniqueName(name: string, currentId?: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('activities')
    .select('id, name')
    .ilike('name', name);

  if (error) return error.message;

  const duplicate = (data ?? []).find((row) => {
    const candidate = String(row.name ?? '').trim().toLocaleLowerCase('it-IT');
    return candidate === name.toLocaleLowerCase('it-IT') && row.id !== currentId;
  });

  return duplicate ? 'Esiste gia un attivita con questo nome.' : null;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { data, error } = await supabaseAdmin
    .from('activities')
    .select('id, name, active, created_at')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const activities = await addUsage((data ?? []) as ActivityRow[]);
    return NextResponse.json({ activities });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore conteggio utilizzo attivita.',
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    name?: unknown;
    active?: unknown;
  };

  const name = normalizeName(body.name);
  if (!name) {
    return NextResponse.json({ error: 'Nome attivita richiesto.' }, { status: 400 });
  }

  const duplicateError = await assertUniqueName(name);
  if (duplicateError) {
    return NextResponse.json({ error: duplicateError }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('activities')
    .insert({
      name,
      active: typeof body.active === 'boolean' ? body.active : true,
    })
    .select('id, name, active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usage: ActivityUsage = {
    assignments: 0,
    sopralluoghiDataset: 0,
    sopralluoghiPdf: 0,
    total: 0,
  };

  return NextResponse.json({ ok: true, activity: { ...(data as ActivityRow), usage } });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    id?: unknown;
    name?: unknown;
    active?: unknown;
  };

  const id = String(body.id ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID attivita richiesto.' }, { status: 400 });
  }

  const name = normalizeName(body.name);
  if (!name) {
    return NextResponse.json({ error: 'Nome attivita richiesto.' }, { status: 400 });
  }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Stato attivita non valido.' }, { status: 400 });
  }

  const duplicateError = await assertUniqueName(name, id);
  if (duplicateError) {
    return NextResponse.json({ error: duplicateError }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('activities')
    .update({
      name,
      active: body.active,
    })
    .eq('id', id)
    .select('id, name, active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const [activity] = await addUsage([data as ActivityRow]);
    return NextResponse.json({ ok: true, activity });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore conteggio utilizzo attivita.',
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get('id') ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'ID attivita richiesto.' }, { status: 400 });
  }

  let usage: ActivityUsage;
  try {
    usage = await getActivityUsage(id);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore verifica utilizzo attivita.',
    }, { status: 500 });
  }

  if (usage.total > 0) {
    return NextResponse.json({
      error: 'Attivita gia utilizzata. Disattivala invece di eliminarla per mantenere storico e collegamenti.',
      usage,
    }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('activities')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
