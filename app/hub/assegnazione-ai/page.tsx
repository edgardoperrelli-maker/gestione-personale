import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AssegnazioneAiClient from '@/components/modules/assegnazione-ai/AssegnazioneAiClient';
import type { RigaPianificabile, FileConfig } from '@/components/modules/assegnazione-ai/AssegnazioneAiClient';

export const dynamic = 'force-dynamic';

export default async function AssegnazioneAiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (role !== 'admin' || !allowedModules.includes('assegnazione-ai')) redirect('/hub');

  const [{ data: cfg }, { data: righe }, { data: fileCfg }] = await Promise.all([
    supabaseAdmin.from('agente_config').select('pianifica_data').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('agente_pianificabili').select('*').order('comune', { ascending: true }).order('riga', { ascending: true }),
    supabaseAdmin.from('agente_file_config').select('*'),
  ]);

  return (
    <AssegnazioneAiClient
      righe={(righe ?? []) as RigaPianificabile[]}
      fileConfig={(fileCfg ?? []) as FileConfig[]}
      pianificaData={(cfg as { pianifica_data?: string | null } | null)?.pianifica_data ?? null}
    />
  );
}
