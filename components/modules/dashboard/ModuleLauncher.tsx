'use client';

import { useEffect, useMemo, useState } from 'react';
import ModuleTile from '@/components/ui/ModuleTile';
import { appNavigation, groupLabels, GROUP_ORDER } from '@/lib/appNavigation';
import type { AppModuleKey, AppModuleGroup } from '@/lib/moduleAccess';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';

const LS_KEY = 'hub-preferiti';

/** Titoletto di sezione: unico segnale di raggruppamento, per tipografia. */
function Titoletto({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-text-subtle)]">
      {children}
    </div>
  );
}

/**
 * Launcher dei moduli sull'hub: card con tile icona, descrizione, stella per i
 * preferiti (localStorage) e ricerca. I preferiti compaiono in testa SOLO se
 * esistono — niente pannello vuoto che mangia il fold.
 *
 * Il 2026-07-23 le tile hanno smesso di colorarsi per gruppo (viola/verde/oro):
 * DESIGN.md §1.2 ammette un solo accento zaffiro e §3 marca quei token come
 * decorativi da NON usare come accenti. Il gruppo ora si legge dai titoletti,
 * cioè per tipografia — che è il principio 4 dello stesso documento.
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

  const perGruppo = GROUP_ORDER
    .map((g) => ({ gruppo: g as AppModuleGroup, voci: altri.filter((i) => i.group === g) }))
    .filter((x) => x.voci.length > 0);

  const card = (i: (typeof moduli)[number]) => {
    const stellato = preferiti.includes(i.key);
    return (
      <ModuleTile
        key={i.key}
        href={i.href}
        title={i.label}
        description={i.description}
        icon={MODULE_ICONS[i.key as AppModuleKey]}
        action={
          /*
            La stella resta SEMPRE visibile. Prima appariva solo su `group-hover`:
            al touch, dove l'hover non esiste, era un bersaglio invisibile ma
            cliccabile sopra il link steso — chi toccava l'angolo metteva un
            preferito senza capire perché.
          */
          <button
            type="button"
            onClick={() => toggle(i.key)}
            aria-pressed={stellato}
            aria-label={stellato ? `Togli ${i.label} dai preferiti` : `Aggiungi ${i.label} ai preferiti`}
            className={`absolute right-2.5 top-2.5 z-10 rounded-[var(--radius-sm)] p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
              stellato
                ? 'text-[var(--brand-primary)]'
                : 'text-[var(--brand-text-subtle)] hover:text-[var(--brand-primary)]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={stellato ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
              <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8Z" />
            </svg>
          </button>
        }
      />
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
          <Titoletto>Preferiti</Titoletto>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{inPreferiti.map(card)}</div>
        </>
      )}

      {perGruppo.map(({ gruppo, voci }) => (
        <div key={gruppo} className="space-y-3">
          <Titoletto>{groupLabels[gruppo]}</Titoletto>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{voci.map(card)}</div>
        </div>
      ))}

      {visibili.length === 0 && (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun modulo corrisponde alla ricerca.
        </p>
      )}
    </section>
  );
}
