import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin')
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  return true;
}

const CampoSchema = z.object({
  chiave: z.string().min(1), etichetta: z.string().min(1),
  tipo: z.enum(['crocetta', 'testo', 'select', 'numero']),
  opzioni: z.array(z.string()).optional(), ordine: z.number().int(),
});
const InfoCampoSchema = z.object({
  chiave: z.enum([
    'nominativo', 'matricola', 'pdr', 'odsin', 'via',
    'comune', 'cap', 'recapito', 'attivita', 'accessibilita', 'fascia_oraria',
  ]),
  etichetta: z.string().min(1),
  ordine: z.number().int(),
});
const TemplateSchema = z.object({
  nome: z.string().min(1),
  campi: z.array(CampoSchema).min(1),
  info_campi: z.array(InfoCampoSchema).default([]),
  active: z.boolean().optional().default(true),
});

export async function GET() {
  const { data, error } = await supabaseAdmin.from('rapportino_template')
    .select('id, nome, campi, info_campi, is_default, active, created_at, updated_at')
    .order('is_default', { ascending: false }).order('nome');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const parsed = TemplateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('rapportino_template')
    .insert({ nome: parsed.data.nome, campi: parsed.data.campi, info_campi: parsed.data.info_campi, active: parsed.data.active }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const parsed = TemplateSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of ['nome', 'campi', 'info_campi', 'active'] as const) if (k in parsed.data) patch[k] = (parsed.data as any)[k];
  const { error } = await supabaseAdmin.from('rapportino_template').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const { count } = await supabaseAdmin
    .from('rapportino_template')
    .select('id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: 'Non puoi eliminare l\'ultimo template rimasto' }, { status: 409 });
  }
  const { error } = await supabaseAdmin.from('rapportino_template').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
