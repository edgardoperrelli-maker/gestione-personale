import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { statoAgente } from '@/lib/agente/decisione';
import { partiRoma } from '@/lib/agente/orarioRoma';
import AgenteClient from '@/components/modules/agente/AgenteClient';
import type {
  AgenteConfigRow,
  AgenteRunRow,
  AgenteFileColonneRow,
} from '@/lib/agente/uiTypes';

export const dynamic = 'force-dynamic';

/** Configurazione di default mostrata se la riga singleton non esiste ancora. */
const CONFIG_DEFAULT: AgenteConfigRow = {
  id: 1,
  enabled: true,
  giorni: [1, 2, 3, 4, 5],
  ora: '21:00',
  dry_run: true,
  finestra_giorni: 15,
  mappatura: [
    { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
    { campo: 'data', colonna: 'data prevista', abilitato: true },
    { campo: 'esito', colonna: 'esito', abilitato: true },
    { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
    { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
  ],
  esito_positivo: 'eseguito',
  esito_negativo: 'No',
  ultimo_giro_il: null,
  ultimo_contatto_il: null,
  ultima_rivendicazione_giorno: null,
  updated_at: new Date(0).toISOString(),
};

/** Minuti interi trascorsi dall'ultimo contatto (null se mai). */
function minutiDa(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60000));
}

export default async function AgentePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  // Gate forte: il modulo controlla un'automazione che scrive su SharePoint.
  if (role !== 'admin' || !allowedModules.includes('agente')) redirect('/hub');

  const [{ data: configRow }, { data: runRows }, { data: fileRows }] = await Promise.all([
    supabaseAdmin.from('agente_config').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('agente_run').select('*').order('creato_il', { ascending: false }).limit(30),
    supabaseAdmin.from('agente_file_colonne').select('*').order('file', { ascending: true }),
  ]);

  const config = (configRow ?? CONFIG_DEFAULT) as AgenteConfigRow;
  const runs = (runRows ?? []) as AgenteRunRow[];
  const files = (fileRows ?? []) as AgenteFileColonneRow[];
  // flag one-shot (non nel tipo config): mostrati come "in attesa" finché l'agente non ticka
  const forzaGiro = (configRow as { forza_giro?: boolean } | null)?.forza_giro === true;
  const forzaScan = (configRow as { forza_scan?: boolean } | null)?.forza_scan === true;
  const forzaAcea = (configRow as { forza_acea_stato?: boolean } | null)?.forza_acea_stato === true;

  const now = new Date();
  const { oggi, oraCorrente, weekday } = partiRoma(now);
  const stato = statoAgente({
    minutiDaContatto: minutiDa(config.ultimo_contatto_il, now),
    enabled: config.enabled,
    giorni: config.giorni,
    ora: config.ora,
    oraCorrente,
    weekday,
    ultimoGiroOggi: !!config.ultimo_giro_il && config.ultimo_giro_il.slice(0, 10) === oggi,
  });

  return (
    <AgenteClient
      config={config}
      runs={runs}
      files={files}
      stato={stato}
      minutiDaContatto={minutiDa(config.ultimo_contatto_il, now)}
      forzaGiro={forzaGiro}
      forzaScan={forzaScan}
      forzaAcea={forzaAcea}
    />
  );
}
