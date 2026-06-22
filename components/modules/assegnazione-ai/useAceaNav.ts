'use client';
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { NavState } from '@/lib/agente/aceaNav';

export function useAceaNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const nav: NavState = useMemo(
    () => ({ commessa: sp.get('commessa'), attivita: sp.get('attivita'), azione: sp.get('azione') }),
    [sp],
  );

  const push = useCallback((next: NavState) => {
    const qs = new URLSearchParams();
    if (next.commessa) qs.set('commessa', next.commessa);
    if (next.attivita) qs.set('attivita', next.attivita);
    if (next.azione) qs.set('azione', next.azione);
    router.push(qs.toString() ? `${pathname}?${qs}` : pathname);
  }, [router, pathname]);

  const vai = useCallback((p: Partial<NavState>) => push({ ...nav, ...p }), [nav, push]);
  const risali = useCallback((to: 'root' | 'commessa' | 'attivita') => {
    if (to === 'root') push({ commessa: null, attivita: null, azione: null });
    else if (to === 'commessa') push({ commessa: nav.commessa, attivita: null, azione: null });
    else push({ commessa: nav.commessa, attivita: nav.attivita, azione: null });
  }, [nav, push]);

  return { nav, vai, risali };
}
