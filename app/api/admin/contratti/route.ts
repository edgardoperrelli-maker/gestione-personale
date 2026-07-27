import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveUserRole } from '@/lib/moduleAccess';
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';

// CRUD dell'anagrafica commesse: committenti → contratti → territori, più il listino.
// Un solo file, quattro entità distinte dal campo `tipo`. Scrittura riservata agli
// admin (service role), come per i territori della mappa.
//
// Le ATTIVITÀ non si gestiscono da qui: sono righe di `attivita_tassonomia`, che ha già
// il suo modulo (/impostazioni/attivita-tassonomia). Il contratto le LEGGE via
// `committenti.codice` — una sola fonte di verità, nessuna copia da tenere allineata.

type Tipo = 'committente' | 'contratto' | 'territorio' | 'listino';

const TABELLA: Record<Tipo, string> = {
  committente: 'committenti',
  contratto: 'contratti',
  territorio: 'contratto_territori',
  listino: 'listino',
};

/** Colonne restituite dopo una scrittura, per entità. */
const SELECT: Record<Tipo, string> = {
  committente: 'id, nome, codice, attivo',
  contratto: 'id, committente_id, nome, valido_dal, valido_al, attivo, note',
  territorio: 'id, contratto_id, nome, territory_id, attivo',
  listino: 'id, contratto_id, attivita, etichetta, azione_chiave, prezzo, valido_dal, valido_al, attivo, note',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const testo = (v: unknown) => String(v ?? '').trim();

async function requireAdmin(): Promise<true | NextResponse> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') {
    return NextResponse.json({ error: 'Accesso riservato agli admin.' }, { status: 403 });
  }
  return true;
}

function tipoValido(v: unknown): v is Tipo {
  return v === 'committente' || v === 'contratto' || v === 'territorio' || v === 'listino';
}

/** Data ISO opzionale: '' e null diventano null, il resto deve essere una data valida. */
function dataOpzionale(v: unknown): string | null | 'errore' {
  const s = testo(v);
  if (s === '') return null;
  return ISO.test(s) ? s : 'errore';
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const b = (await req.json()) as Record<string, unknown>;
  if (!tipoValido(b.tipo)) return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });

  const nome = testo(b.nome);
  let riga: Record<string, unknown>;

  if (b.tipo === 'committente') {
    if (!nome) return NextResponse.json({ error: 'Nome committente richiesto.' }, { status: 400 });
    riga = { nome, codice: testo(b.codice) || null };
  } else if (b.tipo === 'contratto') {
    const committenteId = testo(b.committenteId);
    if (!committenteId) return NextResponse.json({ error: 'Committente richiesto.' }, { status: 400 });
    if (!nome) return NextResponse.json({ error: 'Nome contratto richiesto.' }, { status: 400 });
    const dal = dataOpzionale(b.valido_dal);
    const al = dataOpzionale(b.valido_al);
    if (dal === 'errore' || al === 'errore') {
      return NextResponse.json({ error: 'Date di validità non valide.' }, { status: 400 });
    }
    if (dal && al && al < dal) {
      return NextResponse.json({ error: 'La fine validità precede l\'inizio.' }, { status: 400 });
    }
    riga = { committente_id: committenteId, nome, valido_dal: dal, valido_al: al, note: testo(b.note) || null };
  } else if (b.tipo === 'territorio') {
    const contrattoId = testo(b.contrattoId);
    if (!contrattoId) return NextResponse.json({ error: 'Contratto richiesto.' }, { status: 400 });
    if (!nome) return NextResponse.json({ error: 'Nome territorio richiesto.' }, { status: 400 });
    riga = { contratto_id: contrattoId, nome, territory_id: testo(b.territory_id) || null };
  } else {
    const contrattoId = testo(b.contrattoId);
    if (!contrattoId) return NextResponse.json({ error: 'Contratto richiesto.' }, { status: 400 });
    // La chiave normalizzata è la STESSA del motore economico (normalizzaAttivita):
    // maiuscolo, spazi collassati, senza accenti. Così la tariffa aggancia l'attività.
    const norm = normalizzaAttivita(testo(b.etichetta));
    if (!norm) return NextResponse.json({ error: 'Attività richiesta.' }, { status: 400 });
    const dal = dataOpzionale(b.valido_dal);
    if (dal === 'errore' || dal === null) {
      return NextResponse.json({ error: 'Inizio validità richiesto.' }, { status: 400 });
    }
    const al = dataOpzionale(b.valido_al);
    if (al === 'errore') return NextResponse.json({ error: 'Fine validità non valida.' }, { status: 400 });
    // `committente` resta valorizzato: i 4 consumer del motore economico ACEA ci filtrano sopra.
    const { data: k } = await supabaseAdmin
      .from('contratti')
      .select('committenti(codice)')
      .eq('id', contrattoId)
      .maybeSingle();
    const codice = (k as { committenti?: { codice?: string } | { codice?: string }[] } | null)?.committenti;
    riga = {
      contratto_id: contrattoId,
      committente: (Array.isArray(codice) ? codice[0]?.codice : codice?.codice) ?? 'altro',
      attivita: norm.key,
      etichetta: norm.etichetta,
      azione_chiave: testo(b.azione_chiave) || null,
      prezzo: Number(b.prezzo ?? 0),
      valido_dal: dal,
      valido_al: al,
      note: testo(b.note) || null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from(TABELLA[b.tipo])
    .insert(riga)
    .select(SELECT[b.tipo])
    .single();
  if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, riga: data });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const b = (await req.json()) as Record<string, unknown>;
  if (!tipoValido(b.tipo)) return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });
  const id = testo(b.id);
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.nome !== undefined) {
    const n = testo(b.nome);
    if (!n) return NextResponse.json({ error: 'Nome richiesto.' }, { status: 400 });
    patch.nome = n;
  }
  if (b.attivo !== undefined) patch.attivo = !!b.attivo;
  if (b.note !== undefined) patch.note = testo(b.note) || null;
  if (b.tipo === 'committente' && b.codice !== undefined) patch.codice = testo(b.codice) || null;
  if (b.tipo === 'territorio' && b.territory_id !== undefined) {
    patch.territory_id = testo(b.territory_id) || null;
  }
  if (b.tipo === 'listino' && b.prezzo !== undefined) patch.prezzo = Number(b.prezzo);
  if ((b.tipo === 'contratto' || b.tipo === 'listino')) {
    for (const campo of ['valido_dal', 'valido_al'] as const) {
      if (b[campo] === undefined) continue;
      const v = dataOpzionale(b[campo]);
      if (v === 'errore') return NextResponse.json({ error: `Data ${campo} non valida.` }, { status: 400 });
      patch[campo] = v;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nessun campo da aggiornare.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from(TABELLA[b.tipo])
    .update(patch)
    .eq('id', id)
    .select(SELECT[b.tipo])
    .single();
  if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true, riga: data });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo');
  const id = testo(searchParams.get('id'));
  if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo non valido.' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  // Ciò che è già usato da un appuntamento non si elimina: si disattiva. Vale per il
  // territorio e, a cascata, per tutto ciò che lo contiene (contratto e committente).
  const inUso = await usatoInAppuntamenti(tipo, id);
  if (inUso instanceof NextResponse) return inUso;
  if (inUso) {
    return NextResponse.json(
      { error: 'Già in uso in un appuntamento. Disattivalo invece di eliminarlo.' },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin.from(TABELLA[tipo]).delete().eq('id', id);
  if (error) return NextResponse.json({ error: messaggio(error.message) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** True se l'entità (o un suo discendente) è referenziata da un appuntamento. */
async function usatoInAppuntamenti(tipo: Tipo, id: string): Promise<boolean | NextResponse> {
  const conta = async (colonna: string, valori: string[]): Promise<number | NextResponse> => {
    if (valori.length === 0) return 0;
    const { count, error } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .in(colonna, valori);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return count ?? 0;
  };

  if (tipo === 'listino') return false;
  if (tipo === 'territorio') {
    const n = await conta('appuntamento_territorio_id', [id]);
    return n instanceof NextResponse ? n : n > 0;
  }

  // Committente: prima il riferimento diretto, poi i territori dei suoi contratti.
  if (tipo === 'committente') {
    const diretto = await conta('committente_id', [id]);
    if (diretto instanceof NextResponse) return diretto;
    if (diretto > 0) return true;
  }

  const { data: contratti } = tipo === 'committente'
    ? await supabaseAdmin.from('contratti').select('id').eq('committente_id', id)
    : { data: [{ id }] };
  const ids = ((contratti ?? []) as Array<{ id: string }>).map((k) => k.id);
  if (ids.length === 0) return false;

  const { data: territori } = await supabaseAdmin
    .from('contratto_territori')
    .select('id')
    .in('contratto_id', ids);
  const territorioIds = ((territori ?? []) as Array<{ id: string }>).map((t) => t.id);
  const n = await conta('appuntamento_territorio_id', territorioIds);
  return n instanceof NextResponse ? n : n > 0;
}

/** Rende parlanti gli errori di vincolo di Postgres. */
function messaggio(raw: string): string {
  if (/duplicate key|unique/i.test(raw)) return 'Esiste già una voce con questo nome.';
  if (/contratti_validita_check/i.test(raw)) return 'La fine validità precede l\'inizio.';
  return raw;
}
