// app/hub/interventi/storico/page.tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import StoricoInterventiClient from '@/components/modules/interventi/StoricoInterventiClient';

export const dynamic = 'force-dynamic';

export default async function StoricoInterventiPage() {
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
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Storico interventi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Tutti gli interventi transitati per l&apos;app (programmati e manuali). Di default il giorno corrente; usa la
            ricerca per cercare su tutto lo storico.
          </p>
        </div>
        <Link
          href="/hub/interventi/lista"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          ← Lista assegnazione
        </Link>
      </header>

      <StoricoInterventiClient staff={staff} />
    </main>
  );
}
