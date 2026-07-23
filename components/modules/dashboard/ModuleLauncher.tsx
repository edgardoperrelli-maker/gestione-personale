'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { appNavigation } from '@/lib/appNavigation';
import type { AppModuleKey, AppModuleGroup } from '@/lib/moduleAccess';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';

/** Tile colorata per gruppo (DNA launcher: categoria = colore, cappato ai 4 gruppi). */
const TILE: Record<AppModuleGroup, { bg: string; fg: string }> = {
  pianificazione: { bg: 'var(--brand-violet-soft)', fg: 'var(--brand-violet)' },
  operativita: { bg: 'var(--brand-primary-soft)', fg: 'var(--primary-text)' },
  analisi: { bg: 'var(--brand-green-soft)', fg: 'var(--brand-green)' },
  sistema: { bg: 'var(--brand-gold-soft)', fg: 'var(--brand-gold)' },
};

const LS_KEY = 'hub-preferiti';

/**
 * Launcher dei moduli sull'hub (innesto SupplyHub sul Cockpit): card con tile
 * icona colorata per gruppo, descrizione, stella per i preferiti (localStorage)
 * e ricerca. I preferiti compaiono in testa SOLO se esistono — niente pannello
 * vuoto che mangia il fold.
 */
export default function ModuleLauncher({ allowedModules }: { allowedModules: AppModuleKey[] }) {
  const [preferiti, setPreferiti] = useState<string[]>([]);
  const [caricati, setCaricati] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setPreferiti(JSON.parse(raw) as string[]);
    } catch { /* localStorage non disponibile: si parte senza preferiti */ }
    setCaricati(true);
  }, []);

  const toggle = (key: string) => {
    setPreferiti((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };

  const moduli = useMemo(
    () =>
      appNavigation.filter(
        (i) => i.key !== 'hub' && i.group && allowedModules.includes(i.key as AppModuleKey),
      ),
    [allowedModules],
  );

  const needle = q.trim().toLowerCase();
  const visibili = needle
    ? moduli.filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          (i.description ?? '').toLowerCase().includes(needle),
      )
    : moduli;

  const inPreferiti = visibili.filter((i) => preferiti.includes(i.key));
  const altri = visibili.filter((i) => !preferiti.includes(i.key));

  const card = (i: (typeof moduli)[number]) => {
    const tile = TILE[i.group!];
    const stellato = preferiti.includes(i.key);
    return (
      <div
        key={i.key}
        className="group relative flex items-start gap-3.5 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--shadow-md)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)] motion-reduce:hover:translate-y-0"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)]"
          style={{ backgroundColor: tile.bg, color: tile.fg }}
        >
          {MODULE_ICONS[i.key as AppModuleKey]}
        </span>
        <span className="min-w-0 pr-7">
          <Link href={i.href} className="font-semibold text-[var(--brand-text-main)] focus:outline-none after:absolute after:inset-0 after:content-['']">
            {i.label}
          </Link>
          {i.description && (
            <span className="mt-0.5 block truncate text-xs text-[var(--brand-text-muted)]">{i.description}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => toggle(i.key)}
          aria-pressed={stellato}
          aria-label={stellato ? `Togli ${i.label} dai preferiti` : `Aggiungi ${i.label} ai preferiti`}
          className={`absolute right-2.5 top-2.5 z-10 rounded-[var(--radius-sm)] p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
            stellato ? 'text-[var(--brand-gold)]' : 'text-[var(--brand-text-subtle)] opacity-0 hover:text-[var(--brand-text-muted)] focus-visible:opacity-100 group-hover:opacity-100'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={stellato ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
            <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8Z" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Moduli</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un modulo…"
          aria-label="Cerca un modulo"
          className="ml-auto w-56 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
      </div>

      {caricati && inPreferiti.length > 0 && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-subtle)]">Preferiti</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{inPreferiti.map(card)}</div>
          <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-subtle)]">Tutti</div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{altri.map(card)}</div>

      {visibili.length === 0 && (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun modulo corrisponde alla ricerca.
        </p>
      )}
    </section>
  );
}
