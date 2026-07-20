import 'server-only';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { usernameFromEmail } from '@/lib/auth/usernameFromEmail';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { resolveInfoCampi, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import type { TassonomiaRiga } from '@/lib/attivita/tassonomia';

export type DatiListaAttesa = {
  userId: string;
  /** Anagrafica globale di fallback (template default/primo attivo). */
  infoCampi: TemplateInfoCampo[];
  /** Anagrafica per-committente (template "+" del committente). Vuoto → usa `infoCampi`. */
  infoCampiPerCommittente: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>>;
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  adminNomi: Record<string, string>;
  /** Tassonomia attività: alimenta la select obbligatoria nel pannello di revisione (spec §7). */
  tassonomia: TassonomiaRiga[];
};

/**
 * Controllo accesso al modulo `lista-attesa` + dati condivisi tra la coda
 * (Richieste manuali) e il Registro autorizzazioni. Redirect se non autorizzato.
 */
export async function caricaDatiListaAttesa(): Promise<DatiListaAttesa> {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('lista-attesa')) redirect('/hub');

  // Header info per la revisione: template default PIANIFICATO.
  const { data: tplDefRows } = await supabase
    .from('rapportino_template')
    .select('info_campi, is_default')
    .eq('active', true);
  const tplDef = (tplDefRows ?? []) as Array<{ info_campi: unknown; is_default: boolean }>;
  const tplDefault = tplDef.find((t) => t.is_default) ?? tplDef[0];
  const infoCampi: TemplateInfoCampo[] = resolveInfoCampi((tplDefault?.info_campi ?? null) as TemplateInfoCampo[] | null);

  // Campi esito per committente: solo template SOLO-MANUALE.
  const { data: tplRows } = await supabase
    .from('rapportino_template')
    .select('id, committente, campi, info_campi, is_default, active, solo_manuale')
    .eq('active', true)
    .eq('solo_manuale', true);
  const tpl = (tplRows ?? []) as Array<{ id: string; committente: string | null; campi: unknown; info_campi: unknown; is_default: boolean; active: boolean; solo_manuale?: boolean }>;

  const COMMITTENTI_MANUALI: CommittenteManuale[] = ['acea', 'italgas', 'altro', 'lim_massive'];
  const tplRows2 = tpl as TemplateRow[];
  const campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>> = {};
  const infoCampiPerCommittente: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>> = {};
  for (const committente of COMMITTENTI_MANUALI) {
    const tplId = risolviTemplateCommittente(committente, tplRows2);
    const tplMatch = tplId ? tpl.find((t) => t.id === tplId) : null;
    if (tplMatch) {
      campiPerCommittente[committente] = (tplMatch.campi ?? []) as TemplateCampo[];
      // Anagrafica del pannello di revisione: guidata dal template "+" del committente
      // (coerente con la modale +), non da un unico template globale. Vuota → fallback globale.
      const ic = (tplMatch.info_campi ?? []) as TemplateInfoCampo[];
      if (Array.isArray(ic) && ic.length > 0) infoCampiPerCommittente[committente] = ic;
    }
  }

  // Mappa uuid→nome per la coda (chi ha preso in carico). L'identità vive in auth.users
  // (la tabella profiles è vuota): username derivato dall'email u_<username>@local.it.
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const adminNomi: Record<string, string> = {};
  for (const u of authUsers?.users ?? []) {
    adminNomi[u.id] = usernameFromEmail(u.email) || u.id;
  }

  const tassonomia = await caricaTassonomia().catch(() => []);

  return { userId: user.id, infoCampi, infoCampiPerCommittente, campiPerCommittente, adminNomi, tassonomia };
}
