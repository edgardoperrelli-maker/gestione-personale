import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/apiAuth';
import { derivaModalita, isTipoAssenza } from '@/lib/disponibilita';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SELECT = 'id, staff_id, data, tipo, modalita, ora_da, ora_a, note';

// GET ?data=YYYY-MM-DD  (Mappa)  oppure  ?from=YYYY-MM-DD&to=YYYY-MM-DD  (Cronoprogramma)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const data = sp.get('data');
    const from = sp.get('from');
    const to = sp.get('to');

    let query = supabaseAdmin.from('disponibilita_operatore').select(SELECT);
    if (data) {
      query = query.eq('data', data);
    } else if (from && to) {
      query = query.gte('data', from).lte('data', to);
    } else {
      return NextResponse.json({ error: 'Missing data or from/to' }, { status: 400 });
    }

    const res = await query;
    if (res.error) {
      console.error('GET /api/disponibilita select error:', res.error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }
    return NextResponse.json(res.data ?? []);
  } catch (error) {
    console.error('GET /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST { staff_id, data, tipo, ora_da|null, ora_a|null, note|null } → upsert su (staff_id, data)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { staff_id, data, tipo } = body;
    const ora_da = body.ora_da || null;
    const ora_a = body.ora_a || null;
    const note = body.note || null;

    if (!staff_id || !data || !isTipoAssenza(tipo)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (ora_da && ora_a && ora_da >= ora_a) {
      return NextResponse.json({ error: 'ora_da deve precedere ora_a' }, { status: 400 });
    }

    const row = {
      staff_id,
      data,
      tipo,
      modalita: derivaModalita(ora_da, ora_a),
      ora_da,
      ora_a,
      note,
      updated_at: new Date().toISOString(),
    };

    const res = await supabaseAdmin
      .from('disponibilita_operatore')
      .upsert(row, { onConflict: 'staff_id,data' })
      .select(SELECT)
      .single();

    if (res.error) {
      console.error('POST /api/disponibilita upsert error:', res.error);
      return NextResponse.json({ error: 'Upsert failed' }, { status: 500 });
    }
    return NextResponse.json(res.data);
  } catch (error) {
    console.error('POST /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE ?id=...
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const res = await supabaseAdmin.from('disponibilita_operatore').delete().eq('id', id);
    if (res.error) {
      console.error('DELETE /api/disponibilita error:', res.error);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/disponibilita error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
