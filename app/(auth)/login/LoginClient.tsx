'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Input from '@/components/Input';

export default function LoginClient() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sb = supabaseBrowser();

  const normalizeUsername = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    const withoutDomain =
      trimmed.endsWith('@local.it') ? trimmed.slice(0, -'@local.it'.length) :
      trimmed.endsWith('@local') ? trimmed.slice(0, -'@local'.length) :
      trimmed;
    return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session) router.replace('/hub');
    })();
  }, [router, sb]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(undefined);
    setLoading(true);
    const email = `u_${normalizeUsername(username)}@local.it`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setErr('Credenziali non valide');
    if (data.session) router.push('/hub');
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">Accesso</h2>
          <p className="text-sm text-[var(--brand-text-muted)]">Inserisci le credenziali aziendali.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Username</label>
            <Input
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setU(normalizeUsername(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Password</label>
            <Input
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setP(e.target.value)}
            />
          </div>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <Button type="submit" className="w-full" variant="primary" disabled={loading}>
            {loading ? 'Accesso...' : 'Entra'}
          </Button>
        </form>
      </div>
      <div className="mt-4 text-xs text-[var(--brand-text-muted)]">
        Problemi di accesso? Contatta l&apos;amministratore.
      </div>
    </div>
  );
}
