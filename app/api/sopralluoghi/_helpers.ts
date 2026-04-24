import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';

export function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function mapSopralluoghiErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  const isSchemaCacheError = normalized.includes('schema cache');
  if (isSchemaCacheError && normalized.includes('punti_gas')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424020000_sopralluoghi_punti_gas.sql e poi ricarica la pagina.';
  }

  if (isSchemaCacheError && normalized.includes('excel_url')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424030000_sopralluoghi_excel_output.sql e poi ricarica la pagina.';
  }

  const referencesSopralluoghiSchema = [
    "civici_napoli",
    "microaree_stats",
    "sopralluoghi_pdf_generati",
    "sopralluoghi",
    "territorio_id",
    "excel_url",
  ].some((token) => normalized.includes(token));

  if (isSchemaCacheError && referencesSopralluoghiSchema) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424010000_sopralluoghi_schema_upgrade.sql e poi ricarica la pagina.';
  }

  return message;
}

export async function requireSopralluoghiAdmin(): Promise<NextResponse | { userId: string }> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createRouteHandlerClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 });
  }

  return { userId: user.id };
}
