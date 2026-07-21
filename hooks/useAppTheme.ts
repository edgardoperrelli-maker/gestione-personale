'use client';

import { useEffect, useState } from 'react';

/**
 * Tema corrente dell'app in forma `'light' | 'dark'`.
 *
 * Convenzione del progetto (vedi `app/layout.tsx` e `components/layout/TopBar.tsx`):
 * il tema è light di default e la classe `light` viene aggiunta su `<html>`; il
 * dark è l'assenza della classe (NON viene aggiunta una classe `dark`).
 *
 * mapcn rileva il tema da `.dark`/`.light`/`data-theme`, quindi non vedrebbe il
 * dark del progetto: passiamo il valore di questo hook alla prop `theme` di `<Map>`.
 */
export function useAppTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('light')
      ? 'light'
      : 'dark',
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setTheme(el.classList.contains('light') ? 'light' : 'dark');
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
