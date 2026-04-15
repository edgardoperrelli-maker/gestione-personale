import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, distribuzioni } = body;

    if (!data || !Array.isArray(distribuzioni)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    for (const dist of distribuzioni) {
      const { staff_id, task_count } = dist;

      const { error } = await supabaseAdmin
        .from('mappa_distribuzioni')
        .upsert(
          {
            staff_id,
            data,
            task_count,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,data' }
        );

      if (error) {
        console.error('Upsert error:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/mappa/distribuzioni error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing from/to query parameters' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('mappa_distribuzioni')
      .select('staff_id, data, task_count')
      .gte('data', from)
      .lte('data', to);

    if (error) {
      console.error('SELECT error:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('GET /api/mappa/distribuzioni error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
