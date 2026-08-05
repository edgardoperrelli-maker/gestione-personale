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
  // Primo accesso operatore: le utenze create da /impostazioni/personale hanno
  // `must_change_password: true` nei metadata — il login si ferma qui, su uno step
  // inline che impone la nuova password, e solo dopo prosegue verso `dest`.
  const [step, setStep] = useState<'login' | 'nuova-password'>('login');
  const [dest, setDest] = useState('/hub');
  // Email con cui il login e' riuscito: serve per ri-autenticarsi dopo il cambio
  // password (il set della password lato server revoca le sessioni correnti).
  const [loginEmail, setLoginEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
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
        const meta = (data.user?.app_metadata ?? {}) as { role?: unknown; must_change_password?: unknown };
        // Solo il ruolo ESPLICITO 'operatore' atterra sulla sua giornata: per gli
        // altri (admin, o legacy senza ruolo nei metadata) resta il lanciatore,
        // e ci pensa comunque il middleware a correggere la rotta.
        const target = meta.role === 'operatore' ? '/hub/oggi' : '/hub';
        setLoading(false);
        if (meta.must_change_password === true) {
          setDest(target);
          setLoginEmail(email);
          setStep('nuova-password');
          return;
        }
        router.push(target);
        return;
      }
    }

    setLoading(false);
    setErr('Credenziali non valide');
  };

  const onSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErr(undefined);

    const pwd = newPass.trim();
    if (pwd.length < 6) {
      setErr('La nuova password deve avere almeno 6 caratteri');
      return;
    }
    if (pwd !== confirmPass.trim()) {
      setErr('Le due password non coincidono');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account/cambia-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pwd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setErr(body?.error ?? 'Impossibile aggiornare la password, riprova');
        setLoading(false);
        return;
      }
      // Il set della password (service role) revoca le sessioni: senza questo
      // re-login il push verso l'area protetta rimbalzerebbe muto su /login.
      const { error: reErr } = await sb.auth.signInWithPassword({ email: loginEmail, password: pwd });
      setLoading(false);
      if (reErr) {
        setStep('login');
        setP('');
        setErr('Password aggiornata: accedi con la nuova password');
        return;
      }
      router.push(dest);
    } catch {
      setErr('Errore di rete, riprova');
      setLoading(false);
    }
  };

  if (step === 'nuova-password') {
    return (
      <div className="w-full">
        <div className="rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">Imposta la tua nuova password</h2>
            <p className="text-sm text-[var(--brand-text-muted)]">È il tuo primo accesso: scegli una password personale (minimo 6 caratteri).</p>
          </div>
          <form onSubmit={onSetPassword} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Nuova password</label>
              <Input
                id="new-password"
                placeholder="Nuova password"
                type="password"
                autoComplete="new-password"
                value={newPass}
                error={!!err}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Conferma password</label>
              <Input
                id="confirm-password"
                placeholder="Ripeti la nuova password"
                type="password"
                autoComplete="new-password"
                value={confirmPass}
                error={!!err}
                onChange={(e) => setConfirmPass(e.target.value)}
              />
            </div>
            <p aria-live="polite" className="min-h-[1.25rem] text-sm text-[var(--danger)]">{err}</p>
            <Button type="submit" className="w-full" variant="primary" loading={loading}>
              {loading ? 'Salvataggio…' : 'Salva e continua'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-[var(--shadow-md)]">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">Accesso</h2>
          <p className="text-sm text-[var(--brand-text-muted)]">Inserisci le credenziali aziendali.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Username</label>
            <Input
              id="login-username"
              placeholder="Username o email"
              autoComplete="username"
              value={username}
              error={!!err}
              onChange={(e) => setU(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Password</label>
            <Input
              id="login-password"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              error={!!err}
              onChange={(e) => setP(e.target.value)}
            />
          </div>
          <p aria-live="polite" className="min-h-[1.25rem] text-sm text-[var(--danger)]">{err}</p>
          <Button type="submit" className="w-full" variant="primary" loading={loading}>
            {loading ? 'Accesso…' : 'Entra'}
          </Button>
        </form>
      </div>
      <div className="mt-4 text-xs text-[var(--brand-text-muted)]">
        Problemi di accesso? Contatta l&apos;amministratore.
      </div>
    </div>
  );
}
