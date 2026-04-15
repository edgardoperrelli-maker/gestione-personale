import { createClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OperatorRow {
  staff_id: string;
  staff_name: string;
  colore?: string;
  km?: number;
  task_count?: number;
  start_address?: string;
  tasks?: any;
  polyline?: any;
}

interface PianoRequest {
  data: string;
  territorio: string;
  note?: string;
  operatori: OperatorRow[];
}

// GET: Fetch saved plans for a date range
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const pianoId = searchParams.get('pianoId');

  try {
    let query = supabase
      .from('mappa_piani')
      .select(`
        id,
        data,
        territorio,
        note,
        stato,
        created_at,
        mappa_piani_operatori (
          id,
          staff_id,
          staff_name,
          colore,
          km,
          task_count,
          start_address,
          tasks,
          polyline
        )
      `);

    // If pianoId is provided, fetch specific plan
    if (pianoId) {
      query = query.eq('id', pianoId);
    } else {
      // Otherwise, fetch plans for date range (default: last 30 days)
      const toDate = to ? new Date(to) : new Date();
      const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const fromISO = fromDate.toISOString().split('T')[0];
      const toISO = toDate.toISOString().split('T')[0];

      query = query.gte('data', fromISO).lte('data', toISO);
    }

    query = query.order('data', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST: Save a plan with operators
export async function POST(request: NextRequest) {
  try {
    const body: PianoRequest = await request.json();
    const { data, territorio, note, operatori } = body;

    if (!data || !territorio || !operatori || operatori.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: data, territorio, operatori' },
        { status: 400 }
      );
    }

    // Get current user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Insert piano
    const { data: pianoData, error: pianoError } = await supabase
      .from('mappa_piani')
      .insert({
        data,
        territorio,
        note,
        stato: 'bozza',
        created_by: authHeader.split('Bearer ')[1]?.split('.')[0] || 'unknown',
      })
      .select('id')
      .single();

    if (pianoError) {
      return NextResponse.json({ error: pianoError.message }, { status: 500 });
    }

    const pianoId = pianoData.id;

    // Batch insert operators
    const operatoriWithPianoId = operatori.map((op) => ({
      piano_id: pianoId,
      ...op,
    }));

    const { error: operatoriError } = await supabase
      .from('mappa_piani_operatori')
      .insert(operatoriWithPianoId);

    if (operatoriError) {
      return NextResponse.json({ error: operatoriError.message }, { status: 500 });
    }

    // Upsert distributions (fire-and-forget)
    const distributions = operatori.map((op) => ({
      staff_id: op.staff_id,
      data,
      task_count: op.task_count || 0,
    }));

    supabase.from('mappa_distribuzioni').upsert(distributions).then().catch();

    return NextResponse.json({ id: pianoId, data, territorio, note, operatori }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a plan and cascade delete operators
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pianoId = searchParams.get('id');

    if (!pianoId) {
      return NextResponse.json({ error: 'Missing pianoId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('mappa_piani')
      .delete()
      .eq('id', pianoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
