'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

function SignInInner() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get('redirect') || '/hub';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    setLoading(true);

    const { data: row, error: qErr } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', username)
      .single();

    if (qErr || !row?.email) { setLoading(false); setErr('Utente non trovato'); return; }

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: row.email,
      password,
    });

    setLoading(false);
    if (authErr) { setErr('Credenziali non valide'); return; }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--brand-bg)]">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border border-[var(--brand-border)] rounded-2xl bg-[var(--brand-surface)] p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-center text-[var(--brand-text-main)]">Accesso</h1>

        <label className="block text-sm">
          <span className="text-[var(--brand-text-muted)]">Nome utente</span>
          <input
            type="text"
            className="mt-1 w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)] placeholder-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="text-[var(--brand-text-muted)]">Password</span>
          <input
            type="password"
            className="mt-1 w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)] placeholder-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {err && <p className="text-sm text-[var(--danger)]">{err}</p>}

        <button
          type="submit"
          className="w-full rounded-xl px-4 py-2 bg-[var(--brand-primary)] text-[var(--on-primary)] font-semibold transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Accesso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><SignInInner /></Suspense>;
}
