import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const email = `u_${username}@local`;

  // uso admin per fare signIn via token exchange password
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });

  return NextResponse.json({ session: data.session });
}
