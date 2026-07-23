import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { PageTransitionWrapper } from '@/components/layout/PageTransitionWrapper';
import {
  ASSIGNABLE_ROLE_LABELS,
  getAllowedModulesForUser,
  isAdminAssignableRole,
  resolveAssignableRole,
} from '@/lib/moduleAccess';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });
  // getSession() legge il JWT dal cookie senza round-trip di rete: la convalida
  // server-side (auth.getUser) è già stata fatta dal middleware su questa stessa
  // richiesta (matcher '/dashboard/:path*'), che redirige a /login se non valida.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .maybeSingle();

  // Stessa risoluzione di app/hub/layout.tsx: prima qui viveva un `formatRole`
  // locale con una mappa propria, che a un admin_plus mostrava «Admin» mentre
  // l'hub gli mostrava «Admin Plus». Una sola fonte per l'etichetta.
  const effectiveRole = resolveAssignableRole(profile?.role, user.app_metadata?.role);
  const roleLabel = ASSIGNABLE_ROLE_LABELS[effectiveRole];
  const userName = profile?.username ?? user.email ?? undefined;
  const allowedModules = getAllowedModulesForUser(user.app_metadata, effectiveRole);

  return (
    <AppShell roleLabel={roleLabel} userName={userName} allowedModules={allowedModules} isAdmin={isAdminAssignableRole(effectiveRole)}>
      <PageTransitionWrapper>{children}</PageTransitionWrapper>
    </AppShell>
  );
}
