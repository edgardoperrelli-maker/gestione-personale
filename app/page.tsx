'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function Home() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session) router.replace('/dashboard');
      setChecking(false);
    })();
  }, [router, sb]);

  if (checking) return null;

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Calendario personale</h1>
        <p className="text-sm text-gray-600">Accedi per continuare.</p>
        <Link
          href="/login"
          className="inline-block border rounded px-4 py-2"
        >
          Vai al login
        </Link>
      </div>
    </main>
  );
}
