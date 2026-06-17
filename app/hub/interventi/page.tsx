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
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Storico interventi
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Tutti gli interventi compilati (programmati e manuali). Usa ricerca e filtri per restringere; il contatore e
          l&apos;export rispettano i filtri attivi (senza filtri: intero database).
        </p>
      </header>

      <StoricoInterventiClient staff={staff} />
    </main>
  );
}
