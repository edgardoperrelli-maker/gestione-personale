'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useRouter } from 'next/navigation';

export default function LoginClient() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sb = supabaseBrowser();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session) router.replace('/dashboard');
    })();
  }, [router, sb]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(undefined);
    setLoading(true);
    const email = `u_${username.trim()}@local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setErr('Credenziali non valide');
    if (data.session) router.push('/dashboard');
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Accesso</h1>
      <input className="w-full border p-2 rounded" placeholder="Username"
        autoComplete="username" value={username} onChange={(e)=>setU(e.target.value)} />
      <input className="w-full border p-2 rounded" placeholder="Password" type="password"
        autoComplete="current-password" value={password} onChange={(e)=>setP(e.target.value)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="w-full border p-2 rounded disabled:opacity-50" disabled={loading}>
        {loading ? 'Accesso…' : 'Entra'}
      </button>
    </form>
  );
}
