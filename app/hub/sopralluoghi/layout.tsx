import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import SopralluoghiBackButton from './SopralluoghiBackButton';

export const dynamic = 'force-dynamic';

export default async function SopralluoghiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      <div className="border-b border-[var(--brand-border)] bg-[var(--brand-surface)]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--brand-text-main)]">
                Sopralluoghi
              </h1>
              <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
                Gestione sopralluoghi per territorio
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SopralluoghiBackButton />
              <Link
                href="/hub"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-2 text-sm font-medium text-[var(--brand-text-muted)] transition hover:bg-[var(--brand-nav-active-bg)] hover:text-[var(--brand-primary)]"
              >
                Torna alla dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {children}
      </div>
    </div>
  );
}
