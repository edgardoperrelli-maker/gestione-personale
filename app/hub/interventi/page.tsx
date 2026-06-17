// app/hub/interventi/page.tsx
// Pagina unica del modulo Interventi: la consultazione "Storico interventi".
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import StoricoInterventiClient from '@/components/modules/interventi/StoricoInterventiClient';

export const dynamic = 'force-dynamic';

export default async function InterventiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: staffRows } = await supabase
    .from('staff')
    .select('id, display_name')
    .order('display_name', { ascending: true });
  const staff = ((staffRows ?? []) as Array<{ id: string; display_name: string }>);

  return (
    <main className="w-full space-y-4 px-4 py-6">
      <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
        Storico interventi
      </h1>

      <StoricoInterventiClient staff={staff} />
    </main>
  );
}
