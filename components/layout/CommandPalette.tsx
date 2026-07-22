'use client';

// Command palette (⌘K / Ctrl-K): navigazione rapida tra i moduli.
// Dati derivati da appNavigation (stessa fonte della Sidebar, consumata
// non copiata), filtrati sui moduli permessi all'utente.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { appNavigation, groupLabels, GROUP_ORDER } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';
import { MODULE_ICONS, DASHBOARD_HOME_ICON } from './moduleIcons';

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedModules?: AppModuleKey[];
};

type Entry = {
  href: string;
  label: string;
  group: string;
  icon: React.ReactNode;
};

export default function CommandPalette({ open, onOpenChange, allowedModules }: CommandPaletteProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scorciatoia globale ⌘K / Ctrl-K (attiva finché la shell è montata).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Reset alla riapertura + focus sull'input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const base: Entry[] = [
      { href: '/hub', label: 'Dashboard', group: 'Panoramica', icon: DASHBOARD_HOME_ICON },
    ];
    const visibili = appNavigation.filter((item) => {
      if (item.key === 'hub') return false;
      return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
    });
    for (const group of GROUP_ORDER) {
      for (const item of visibili.filter((i) => i.group === group)) {
        // Parità con la Sidebar: il modulo mappa espone due viste distinte.
        if (item.key === 'mappa') {
          base.push(
            { href: '/hub/mappa?vista=pianifica', label: 'Pianificazione', group: groupLabels[group], icon: MODULE_ICONS.mappa },
            { href: '/hub/mappa?vista=riepilogo', label: 'Riepilogo rapportini', group: groupLabels[group], icon: MODULE_ICONS.mappa },
          );
        } else {
          base.push({
            href: item.href,
            label: item.label,
            group: groupLabels[group],
            icon: MODULE_ICONS[item.key as AppModuleKey],
          });
        }
      }
    }
    return base;
  }, [allowedModules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.group.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const vai = (entry: Entry) => {
    onOpenChange(false);
    router.push(entry.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = filtered[selected];
      if (entry) vai(entry);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[15dvh]"
          style={{ background: 'var(--overlay)' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Cerca moduli"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduced
                ? { opacity: 0, transition: { duration: 0.1 } }
                : { opacity: 0, scale: 0.98, transition: { duration: 0.1 } }
            }
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-3.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Cerca moduli e viste…"
                aria-label="Cerca moduli e viste"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-listbox"
                className="w-full border-none bg-transparent py-3 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none"
                style={{ border: 'none', boxShadow: 'none' }}
              />
              <kbd className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--brand-text-subtle)]">
                Esc
              </kbd>
            </div>
            <ul id="palette-listbox" role="listbox" aria-label="Risultati" className="max-h-[50dvh] overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-[var(--brand-text-muted)]">
                  Nessun modulo trovato per «{query}».
                </li>
              )}
              {filtered.map((entry, i) => (
                <li key={entry.href} role="option" aria-selected={i === selected}>
                  <button
                    type="button"
                    onClick={() => vai(entry)}
                    onMouseEnter={() => setSelected(i)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors ${
                      i === selected
                        ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
                        : 'text-[var(--brand-text-main)]'
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">{entry.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                    <span className="shrink-0 text-xs text-[var(--brand-text-subtle)]">{entry.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
