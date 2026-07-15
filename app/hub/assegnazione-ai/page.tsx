import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AssegnazioniAiClient from '@/components/modules/assegnazione-ai/AssegnazioniAiClient';
import type { RigaPianificabile, FileConfig } from '@/components/modules/assegnazione-ai/tipi';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import type { FileMaster } from '@/lib/agente/comuni';

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

  const [{ data: cfg }, { data: righe }, { data: fileCfg }, { data: runRows }, { data: fileColonne }] = await Promise.all([
    supabaseAdmin.from('agente_config').select('pianifica_data, ultimo_contatto_il').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('agente_pianificabili').select('*').order('comune', { ascending: true }).order('riga', { ascending: true }),
    supabaseAdmin.from('agente_file_config').select('*'),
    // Niente `dettaglio` (JSONB ~27KB/riga): la lista storico ne mostra solo i
    // conteggi; il dettaglio si carica on-demand all'espansione (StoricoCard).
    supabaseAdmin
      .from('agente_run')
      .select('id, creato_il, dry_run, lavori, aggiornate, extra, conflitti, non_collocate, errore, tipo')
      .order('creato_il', { ascending: false })
      .limit(30),
    // Comuni delle limitazioni massive per i select delle foglie: il comune È il nome del file
    // master scansionato dall'agente (LABICO.xlsx → LABICO).
    supabaseAdmin.from('agente_file_colonne').select('file, is_master'),
  ]);

  const ultimoContatto = (cfg as { ultimo_contatto_il?: string | null } | null)?.ultimo_contatto_il ?? null;
  const minutiDaContatto = ultimoContatto
    ? Math.max(0, Math.floor((Date.now() - new Date(ultimoContatto).getTime()) / 60000))
    : null;

  return (
    <AssegnazioniAiClient
      righe={(righe ?? []) as RigaPianificabile[]}
      fileConfig={(fileCfg ?? []) as FileConfig[]}
      pianificaData={(cfg as { pianifica_data?: string | null } | null)?.pianifica_data ?? null}
      runs={(runRows ?? []) as AgenteRunRow[]}
      filesMaster={(fileColonne ?? []) as FileMaster[]}
      online={{ minutiDaContatto, ultimoContatto }}
    />
  );
}
