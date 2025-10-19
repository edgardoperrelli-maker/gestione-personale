'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get('redirect') || '/dashboard';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    setLoading(true);

    // 1) risolvi username -> email
    const { data: row, error: qErr } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', username)
      .single();

    if (qErr || !row?.email) {
      setLoading(false);
      setErr('Utente non trovato');
      return;
    }

    // 2) login con email mappata
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-2xl p-6">
        <h1 className="text-xl font-semibold text-center">Accesso</h1>

        <label className="block text-sm">
          <span className="text-gray-600">Nome utente</span>
          <input
            type="text"
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Password</span>
          <input
            type="password"
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <button type="submit" className="w-full rounded-xl px-4 py-2 border" disabled={loading}>
          {loading ? 'Accesso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}
