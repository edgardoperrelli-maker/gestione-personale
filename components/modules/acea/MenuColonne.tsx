'use client';

import { useEffect, useRef, useState } from 'react';
import { Columns3, Download } from 'lucide-react';
import Button from '@/components/Button';
import type { DefColonna } from '@/lib/acea/colonneTabella';

type Props = {
  colonne: DefColonna[];
  visibili: Set<string>;
  onChange: (v: Set<string>) => void;
  onEsporta: () => void;
  esportando?: boolean;
};

/** Scelta delle colonne visibili + export della vista filtrata corrente. */
export default function MenuColonne({ colonne, visibili, onChange, onEsporta, esportando }: Props) {
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener('mousedown', fuori);
    return () => document.removeEventListener('mousedown', fuori);
  }, [aperto]);

  const scambia = (chiave: string) => {
    const v = new Set(visibili);
    if (v.has(chiave)) {
      // Almeno una colonna deve restare: una tabella vuota non è uno stato utile.
      if (v.size > 1) v.delete(chiave);
    } else {
      v.add(chiave);
    }
    onChange(v);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={box}>
        <Button variant="outline" size="sm" onClick={() => setAperto((a) => !a)} aria-expanded={aperto}>
          <Columns3 size={14} aria-hidden="true" />
          Colonne
        </Button>
        {aperto && (
          <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-auto rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 shadow-[var(--shadow-md)]">
            {colonne.map((c) => (
              <label
                key={c.chiave}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--brand-surface-muted)]"
              >
                <input
                  type="checkbox"
                  checked={visibili.has(c.chiave)}
                  onChange={() => scambia(c.chiave)}
                />
                <span className="text-[var(--brand-text-main)]">{c.intestazione}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={onEsporta} loading={esportando}>
        <Download size={14} aria-hidden="true" />
        Esporta vista
      </Button>
    </div>
  );
}
