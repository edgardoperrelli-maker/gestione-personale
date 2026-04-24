import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isSopralluoghiActivityAllowed } from '@/lib/sopralluoghiActivities';

export function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function mapSopralluoghiErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('civici_napoli_odonimo_civico_key')) {
    return 'Il database ha ancora il vincolo legacy civici_napoli_odonimo_civico_key. Applica la migration supabase/migrations/20260424040000_sopralluoghi_drop_legacy_civici_unique.sql e ripeti l\'import.';
  }

  const isSchemaCacheError = normalized.includes('schema cache');
  if (isSchemaCacheError && normalized.includes('punti_gas')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424020000_sopralluoghi_punti_gas.sql e poi ricarica la pagina.';
  }

  if (isSchemaCacheError && normalized.includes('excel_url')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424030000_sopralluoghi_excel_output.sql e poi ricarica la pagina.';
  }

  if (isSchemaCacheError && normalized.includes('activity_id')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424050000_sopralluoghi_activity_scope.sql e poi ricarica la pagina.';
  }

  if (isSchemaCacheError && normalized.includes('comune')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424070000_sopralluoghi_comune_scope.sql e poi ricarica la pagina.';
  }

  if (normalized.includes('sopralluoghi_dataset_caricati')) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424080000_sopralluoghi_dataset_catalog.sql e poi ricarica la pagina.';
  }

  if (normalized.includes('no unique or exclusion constraint matching the on conflict specification')) {
    return 'Schema database Sopralluoghi non allineato alla nuova regola doppioni. Applica la migration supabase/migrations/20260424060000_sopralluoghi_scope_unique_address.sql e poi ripeti l\'operazione.';
  }

  const referencesSopralluoghiSchema = [
    "civici_napoli",
    "microaree_stats",
    "sopralluoghi_pdf_generati",
    "sopralluoghi_dataset_caricati",
    "sopralluoghi",
    "territorio_id",
    "activity_id",
    "comune",
    "excel_url",
  ].some((token) => normalized.includes(token));

  if (isSchemaCacheError && referencesSopralluoghiSchema) {
    return 'Schema database Sopralluoghi non aggiornato. Applica la migration supabase/migrations/20260424010000_sopralluoghi_schema_upgrade.sql e poi ricarica la pagina.';
  }

  return message;
}

export type SopralluoghiActivityRecord = {
  id: string;
  name: string;
};

export async function requireSopralluoghiActivity(
  activityId: string,
): Promise<SopralluoghiActivityRecord> {
  const trimmedId = activityId.trim();
  if (!trimmedId) {
    throw new Error('Seleziona una tipologia di lavoro.');
  }

  const { data: activity, error } = await supabaseAdmin
    .from('activities_renamed')
    .select('id, name')
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    throw new Error(mapSopralluoghiErrorMessage(error.message));
  }

  if (!activity || !isSopralluoghiActivityAllowed(activity)) {
    throw new Error('Seleziona una tipologia di lavoro valida dal cronoprogramma.');
  }

  return activity;
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
