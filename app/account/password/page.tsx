'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function OperatorCard() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | undefined>();
  const [err, setErr] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) router.replace('/auth/login');
    })();
  }, [router, sb]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(undefined);
    setMsg(undefined);

    if (!newPwd || newPwd !== confirm) {
      setErr('Le password non coincidono');
      return;
    }

    const { error } = await sb.auth.updateUser({ password: newPwd });
    if (error) setErr(error.message);
    else setMsg('Password aggiornata. Effettua di nuovo il login.');
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Cambia password</h1>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          placeholder="Nuova password"
          autoComplete="new-password"
          className="w-full border rounded px-3 py-2"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
        />
        <input
          type="password"
          placeholder="Conferma password"
          autoComplete="new-password"
          className="w-full border rounded px-3 py-2"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" className="w-full bg-blue-600 text-white rounded px-3 py-2">
          Salva
        </button>
      </form>

      {err && <p className="text-red-600 text-sm">{err}</p>}
      {msg && <p className="text-green-700 text-sm">{msg}</p>}
    </div>
  );
}
