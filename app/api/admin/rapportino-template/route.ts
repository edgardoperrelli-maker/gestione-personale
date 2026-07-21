import { NextResponse } from 'next/server';
import { TemplateSchema } from '@/lib/rapportini/templateSchema';
import { normalizzaCollegamento } from '@/lib/rapportini/flussiGruppo';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { maiuscolo, maiuscolaEtichette } from '@/lib/testo/maiuscolo';

export const runtime = 'nodejs';

export async function GET() {
  // supabaseAdmin bypassa la RLS: senza guard la lista dei flussi era leggibile
  // da non autenticati (le route API non passano dal matcher del middleware).
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const { data, error } = await supabaseAdmin.from('rapportino_template')
    .select('id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo, active, solo_manuale, task_via, task_via_ibrido, gruppo_committente, gruppi_attivita, created_at, updated_at')
    .order('nome');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const parsed = TemplateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('rapportino_template')
    .insert({ nome: maiuscolo(parsed.data.nome), committente: parsed.data.committente ?? null, campi: maiuscolaEtichette(parsed.data.campi), info_campi: maiuscolaEtichette(parsed.data.info_campi), titolo_campi: parsed.data.titolo_campi, foto_id_priority: parsed.data.foto_id_priority, tipo: parsed.data.tipo, active: parsed.data.active, solo_manuale: parsed.data.solo_manuale ?? false, task_via: parsed.data.task_via ?? false, task_via_ibrido: parsed.data.task_via_ibrido ?? false, ...normalizzaCollegamento(parsed.data) }).select('id, updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, updated_at: data.updated_at });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  const parsed = TemplateSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of ['nome', 'committente', 'campi', 'info_campi', 'titolo_campi', 'foto_id_priority', 'tipo', 'active', 'solo_manuale', 'task_via', 'task_via_ibrido'] as const) if (k in parsed.data) patch[k] = (parsed.data as Record<string, unknown>)[k];
  // Collegamento "Azioni operatori": il client manda sempre la coppia; qui la si rende coerente
  // col check DB (committente + gruppi non vuoti, oppure entrambi null).
  if ('gruppo_committente' in parsed.data || 'gruppi_attivita' in parsed.data) {
    Object.assign(patch, normalizzaCollegamento(parsed.data));
  }
  // DB pulito: nome ed etichette dei campi in MAIUSCOLO (chiave/tipo/opzioni intatti).
  if (typeof patch.nome === 'string') patch.nome = maiuscolo(patch.nome);
  if ('campi' in patch) patch.campi = maiuscolaEtichette(patch.campi as Array<{ etichetta?: unknown }>);
  if ('info_campi' in patch) patch.info_campi = maiuscolaEtichette(patch.info_campi as Array<{ etichetta?: unknown }>);
  // Avanza sempre updated_at: è il "version token" per la concorrenza ottimistica.
  patch.updated_at = new Date().toISOString();

  // Lock ottimistico: se il client manda `expected_updated_at`, aggiorna SOLO se il record non è
  // cambiato nel frattempo (es. una SQL diretta o un'altra sessione). Così l'editor non sovrascrive
  // più con uno stato vecchio: in caso di mismatch torna 409 e l'UI ricarica la versione aggiornata.
  const expected = typeof body.expected_updated_at === 'string' ? body.expected_updated_at : null;
  let q = supabaseAdmin.from('rapportino_template').update(patch).eq('id', body.id);
  if (expected) q = q.eq('updated_at', expected);
  const { data, error } = await q.select('id, updated_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (expected && (!data || data.length === 0)) {
    const { data: cur } = await supabaseAdmin.from('rapportino_template').select('updated_at').eq('id', body.id).maybeSingle();
    return NextResponse.json(
      { error: 'Il template è stato modificato altrove.', conflict: true, updated_at: cur?.updated_at ?? null },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, updated_at: data?.[0]?.updated_at ?? null });
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
