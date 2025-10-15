'use client';
import { PropsWithChildren, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function AuthGate({ children }: PropsWithChildren) {
  const sb = supabaseBrowser();
  const [ok, setOk] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      setOk(true);
    })();
  }, []);

  if (!ok) return null;
  return <>{children}</>;
}
