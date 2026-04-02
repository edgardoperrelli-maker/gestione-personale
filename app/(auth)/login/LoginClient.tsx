'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Input from '@/components/Input';

const LOCAL_DOMAIN = '@local.it';
const LEGACY_LOCAL_DOMAIN = '@local';

function normalizeLocalUsername(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutDomain =
    trimmed.endsWith(LOCAL_DOMAIN) ? trimmed.slice(0, -LOCAL_DOMAIN.length) :
    trimmed.endsWith(LEGACY_LOCAL_DOMAIN) ? trimmed.slice(0, -LEGACY_LOCAL_DOMAIN.length) :
    trimmed;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

function buildLoginCandidates(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return [];

  const candidates = new Set<string>();
  const normalizedUsername = normalizeLocalUsername(raw);
  const isLocalAlias = raw.endsWith(LOCAL_DOMAIN) || raw.endsWith(LEGACY_LOCAL_DOMAIN);

  if (!raw.includes('@')) {
    candidates.add(`u_${normalizedUsername}${LOCAL_DOMAIN}`);
    candidates.add(`u_${normalizedUsername}${LEGACY_LOCAL_DOMAIN}`);
    return Array.from(candidates);
  }

  candidates.add(raw);

  if (isLocalAlias || raw.startsWith('u_')) {
    candidates.add(`u_${normalizedUsername}${LOCAL_DOMAIN}`);
    candidates.add(`u_${normalizedUsername}${LEGACY_LOCAL_DOMAIN}`);
  }

  return Array.from(candidates);
}

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
      if (session) router.replace('/hub');
    })();
  }, [router, sb]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(undefined);
    setLoading(true);

    const candidates = buildLoginCandidates(username);

    for (const email of candidates) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        setLoading(false);
        router.push('/hub');
        return;
      }
    }

    setLoading(false);
    setErr('Credenziali non valide');
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
              placeholder="Username o email"
              autoComplete="username"
              value={username}
              onChange={(e) => setU(e.target.value)}
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
