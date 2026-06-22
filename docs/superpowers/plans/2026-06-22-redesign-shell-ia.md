# Redesign sobrio — Piano 3: Shell + IA gruppi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Raggruppare la sidebar in 4 sezioni (Pianificazione / Operatività / Analisi / Sistema) via un campo additivo `group`, e rendere shell (Sidebar/TopBar/AppShell) sobria: stato attivo blu con barra, focus ring, densità, overlay/ombre tokenizzati.

**Architecture:** `group` è un campo **additivo** su `AppModuleDefinition` (non tocca `section`, che resta la fonte per middleware/hub). `appNavigation` lo propaga + espone `groupLabels`/`GROUP_ORDER`. `Sidebar` raggruppa per `group` invece che per `section`. Permessi, collapse, drawer mobile, badge lista-attesa, caso speciale Mappa restano identici.

**Tech Stack:** Next.js 15, React 19, Tailwind v4. Verifica: `npm run build` + visivo PENDING.

## Global Constraints

- Nessuna SQL, nessuna logica di permessi/gating toccata. `section` NON va rinominata né riusata per i gruppi (il `group` è separato/additivo). Invariante `impostazioni ⟺ admin` invariata.
- Filtro `allowedModules`, esclusione `hub`, stato collapse (`sidebar:collapsed`), drawer mobile (Escape/cambio-rotta), badge lista-attesa, caso Mappa (Pianificazione + Riepilogo), toggle tema (`TopBar`) → comportamento INVARIATO.
- Token NAMES stabili; usare i token Piano 1 (`--primary-text`, `--brand-primary-soft`, `--brand-surface-muted`, `--brand-border`, `--overlay`, `--shadow-lg`, `--radius-md`).
- Branch `restyle/aurea-light`. NON toccare file acea non committati. Commit mirati. Niente push.
- Verifica = `npm run build` (gate) + visivo PENDING (login). No unit test.

---

## File Structure

| File | Azione |
|---|---|
| `lib/moduleAccess.ts` | Modify (T1) — tipo `AppModuleGroup` + campo `group` su `AppModuleDefinition` e su ogni `APP_MODULES` |
| `lib/appNavigation.ts` | Modify (T1) — `group` su `NavItem`, `groupLabels`, `GROUP_ORDER` |
| `components/layout/Sidebar.tsx` | Modify (T2) — raggruppamento 4 sezioni + stato attivo sobrio |
| `components/layout/TopBar.tsx` | Modify (T3) — pill ruolo/toggle/logout sobri + focus ring |
| `components/layout/AppShell.tsx` | Modify (T3) — overlay drawer `--overlay` + ombra `--shadow-lg` |

---

## Task 1: Campo `group` (dati)

**Files:** Modify `lib/moduleAccess.ts`, `lib/appNavigation.ts`

**Interfaces produced:** `AppModuleGroup` type; `AppModuleDefinition.group`; `NavItem.group`; `groupLabels`; `GROUP_ORDER`.

- [ ] **Step 1: moduleAccess — tipo + campo.** In `lib/moduleAccess.ts`:
  - Aggiungi dopo `export type AppModuleKey = …;` (dopo la riga 23):
```tsx
export type AppModuleGroup = 'pianificazione' | 'operativita' | 'analisi' | 'sistema';
```
  - Nel tipo `AppModuleDefinition` (righe 25-36) aggiungi il campo opzionale (subito dopo `section: '...';`):
```tsx
  /** Raggruppamento SOLO per la UI della sidebar (additivo, non incide su access/gating). */
  group?: AppModuleGroup;
```

- [ ] **Step 2: moduleAccess — valorizza `group` su ogni modulo.** In `APP_MODULES` aggiungi una riga `group: '...'` a ciascun oggetto, secondo questa mappa:
  - `dashboard` (Cronoprogramma) → `group: 'pianificazione'`
  - `hotel-calendar` → `group: 'operativita'`
  - `mappa` → `group: 'pianificazione'`
  - `interventi` → `group: 'operativita'`
  - `live` → `group: 'operativita'`
  - `lista-attesa` → `group: 'operativita'`
  - `appuntamenti` → `group: 'pianificazione'`
  - `misuratori` → `group: 'operativita'`
  - `agente` → `group: 'analisi'`
  - `assegnazione-ai` → `group: 'pianificazione'`
  - `performance` → `group: 'analisi'`
  - `impostazioni` → `group: 'sistema'`
  (Aggiungere la riga senza rimuovere `section`/`adminOnly`/`requiresAdminRole`.)

- [ ] **Step 3: appNavigation — propaga.** Sostituisci interamente `lib/appNavigation.ts` con:

```tsx
import { APP_MODULES, type AppModuleGroup } from '@/lib/moduleAccess';

export type NavItem = {
  key: string;
  href: string;
  label: string;
  description?: string;
  section: 'overview' | 'modules' | 'system';
  group?: AppModuleGroup;
  matchPrefixes?: string[];
};

export const appNavigation: NavItem[] = [
  {
    key: 'hub',
    href: '/hub',
    label: 'Hub',
    description: 'Accesso rapido ai moduli',
    section: 'overview',
    matchPrefixes: ['/hub'],
  },
  ...APP_MODULES.map((module) => ({
    key: module.key,
    href: module.href,
    label: module.label,
    description: module.description,
    section: module.section,
    group: module.group,
    matchPrefixes: module.matchPrefixes,
  })),
];

export const sectionLabels: Record<NavItem['section'], string> = {
  overview: 'Panoramica',
  modules: 'Moduli',
  system: 'Sistema',
};

export const groupLabels: Record<AppModuleGroup, string> = {
  pianificazione: 'Pianificazione',
  operativita: 'Operatività',
  analisi: 'Analisi',
  sistema: 'Sistema',
};

export const GROUP_ORDER: AppModuleGroup[] = ['pianificazione', 'operativita', 'analisi', 'sistema'];
```

- [ ] **Step 4: Build + commit.** Run `npm run build` (pass). Poi:
```bash
git add lib/moduleAccess.ts lib/appNavigation.ts
git commit -m "feat(restyle): campo additivo group + groupLabels/GROUP_ORDER per IA sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Sidebar raggruppata + stato attivo sobrio

**Files:** Modify `components/layout/Sidebar.tsx`

**Interfaces consumed:** `groupLabels`, `GROUP_ORDER` (T1); `--primary-text`, `--brand-primary-soft`, `--brand-surface-muted`, `--radius-md`.

- [ ] **Step 1: Sostituisci interamente `components/layout/Sidebar.tsx` con:**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { appNavigation, groupLabels, GROUP_ORDER } from '@/lib/appNavigation';
import type { AppModuleKey } from '@/lib/moduleAccess';
import { MODULE_ICONS, DASHBOARD_HOME_ICON } from './moduleIcons';
import { useRichiesteManualiContext } from './RichiesteManualiProvider';

const RIEPILOGO_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M9 11l3 3 8-8" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const ACCOUNT_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

type SidebarProps = {
  allowedModules?: AppModuleKey[];
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
};

function matchesPath(pathname: string, href: string, matchPrefixes?: string[]): boolean {
  const prefixes = matchPrefixes?.length ? matchPrefixes : [href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function Sidebar({
  allowedModules,
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vistaMappa = searchParams.get('vista');
  const { count: nAttesa } = useRichiesteManualiContext();
  const badgeAttesa = nAttesa > 0 ? (
    <span
      aria-label={`${nAttesa} in attesa`}
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] text-[var(--on-danger)] ${collapsed ? 'absolute right-1 top-1' : ''}`}
      style={{ backgroundColor: 'var(--status-ko)' }}
    >
      {nAttesa > 99 ? '99+' : nAttesa}
    </span>
  ) : null;

  const visibleItems = appNavigation.filter((item) => {
    if (item.key === 'hub') return false;
    return !allowedModules || allowedModules.includes(item.key as AppModuleKey);
  });

  const homeActive = pathname === '/hub';
  const accountActive = pathname.startsWith('/account/');

  const renderLink = (
    href: string,
    label: string,
    icon: React.ReactNode,
    active: boolean,
    trailing?: React.ReactNode,
  ) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
        collapsed ? 'justify-center' : ''
      } ${active ? 'bg-[var(--brand-primary-soft)] font-semibold' : 'hover:bg-[var(--brand-surface-muted)]'}`}
      style={{ color: active ? 'var(--primary-text)' : 'var(--brand-text-main)' }}
    >
      {active && !collapsed && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        />
      )}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {trailing}
    </Link>
  );

  const renderModuleLinks = (group: (typeof GROUP_ORDER)[number]) =>
    visibleItems
      .filter((item) => item.group === group)
      .flatMap((item) => {
        if (item.key === 'mappa') {
          const suMappa = pathname === '/hub/mappa' || pathname.startsWith('/hub/mappa/');
          return [
            renderLink('/hub/mappa?vista=pianifica', 'Pianificazione', MODULE_ICONS.mappa, suMappa && vistaMappa !== 'riepilogo'),
            renderLink('/hub/mappa?vista=riepilogo', 'Riepilogo rapportini', RIEPILOGO_ICON, suMappa && vistaMappa === 'riepilogo'),
          ];
        }
        return [
          renderLink(
            item.href,
            item.label,
            MODULE_ICONS[item.key as AppModuleKey],
            matchesPath(pathname, item.href, item.matchPrefixes),
            item.key === 'lista-attesa' ? badgeAttesa : undefined,
          ),
        ];
      });

  return (
    <div
      className={`flex h-full flex-col border-r bg-[var(--brand-surface)] ${collapsed ? 'w-16' : 'w-60'}`}
      style={{ borderColor: 'var(--brand-border)' }}
    >
      {/* Brand / Dashboard home */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Link
          href="/hub"
          onClick={onNavigate}
          title="Dashboard"
          className={`flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 transition hover:bg-[var(--brand-surface-muted)] ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ color: 'var(--brand-primary)' }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-primary-soft)]">
            {DASHBOARD_HOME_ICON}
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-bold tracking-[0.04em]">PLENZICH</span>
              <span className="truncate text-[9px] tracking-[0.12em] text-[var(--brand-text-subtle)]">DASHBOARD</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3 sidebar-scrollbar">
        {renderLink('/hub', 'Dashboard', DASHBOARD_HOME_ICON, homeActive)}

        {GROUP_ORDER.map((group, idx) => {
          const links = renderModuleLinks(group);
          const isSistema = group === 'sistema';
          if (links.length === 0 && !isSistema) return null;
          return (
            <div key={group} className="space-y-1">
              {collapsed ? (
                idx > 0 && <div className="mx-2 my-1 border-t" style={{ borderColor: 'var(--brand-border)' }} />
              ) : (
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-subtle)]">
                  {groupLabels[group]}
                </p>
              )}
              {links}
              {isSistema && renderLink('/account/password', 'Account', ACCOUNT_ICON, accountActive)}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle (solo desktop) */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          title={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          className={`m-2 flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={collapsed ? 'rotate-180' : ''}
            aria-hidden="true"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>
          {!collapsed && <span>Comprimi</span>}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build.** Run `npm run build` → deve passare. Verifica che `MODULE_ICONS`/`DASHBOARD_HOME_ICON` siano ancora importati correttamente (firma invariata).

- [ ] **Step 3: Commit.**
```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(restyle): sidebar raggruppata a 4 sezioni + stato attivo blu sobrio

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: TopBar + AppShell sobri

**Files:** Modify `components/layout/TopBar.tsx`, `components/layout/AppShell.tsx`

- [ ] **Step 1: TopBar — pill ruolo neutra + focus ring.** In `components/layout/TopBar.tsx`:
  - Header (riga 36): rimuovi lo `shadow-sm` (resta `border-b ... backdrop-blur`): da `className="sticky top-0 z-30 border-b bg-[var(--brand-surface)]/95 shadow-sm backdrop-blur"` a `className="sticky top-0 z-30 border-b bg-[var(--brand-surface)]/95 backdrop-blur"`.
  - Wordmark (riga 52): da `text-sm font-extrabold tracking-[0.12em]` a `text-sm font-bold tracking-[0.06em]`.
  - Pill ruolo (righe 58-63): cambia `bg-[var(--brand-primary-soft)]` → `bg-[var(--brand-surface-muted)]` e lo `style` `color: 'var(--brand-primary)'` → `color: 'var(--brand-text-muted)'`.
  - I 3 `<button>` (menu mobile riga 45, toggle tema riga 77, Esci riga 94): in ciascuna `className` cambia `hover:bg-[var(--brand-primary-soft)]` → `hover:bg-[var(--brand-surface-muted)]` e aggiungi `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]`. Cambia anche `rounded-lg` → `rounded-[var(--radius-md)]` negli stessi 3 bottoni.

- [ ] **Step 2: AppShell — overlay + ombra drawer tokenizzati.** In `components/layout/AppShell.tsx`:
  - riga 96: `className="absolute inset-0 bg-[oklch(0_0_0/0.5)]"` → `className="absolute inset-0"` + aggiungi `style={{ background: 'var(--overlay)' }}` allo stesso div (mantieni `onClick` e `aria-hidden`).
  - riga 100: `className="absolute inset-y-0 left-0 h-full shadow-xl"` → `className="absolute inset-y-0 left-0 h-full shadow-[var(--shadow-lg)]"`.

- [ ] **Step 3: Build + commit.** Run `npm run build` (pass). Poi:
```bash
git add components/layout/TopBar.tsx components/layout/AppShell.tsx
git commit -m "feat(restyle): TopBar pill/focus sobri + overlay drawer tokenizzato

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (eseguita)

**1. Copertura spec (S5):** campo `group` additivo (T1) + raggruppamento 4 sezioni + stato attivo sobrio (T2) + TopBar/drawer tokenizzati (T3). Caso Mappa, badge lista-attesa, collapse, drawer, toggle tema, filtro permessi → preservati nel codice (verificabile nel diff).
**2. Placeholder scan:** nessun TBD; codice completo (Sidebar intero + edit puntuali).
**3. Coerenza nomi/tipi:** `AppModuleGroup`/`group`/`groupLabels`/`GROUP_ORDER` definiti in T1 e usati in T2 con gli stessi nomi. `MODULE_ICONS`/`DASHBOARD_HOME_ICON` invariati. Token `--primary-text`/`--brand-surface-muted`/`--overlay`/`--shadow-lg`/`--status-ko`/`--on-danger`/`--radius-md` definiti dal Piano 1. Il badge lista-attesa passa da `--danger` a `--status-ko` (+ testo `--on-danger`): coerente con i token di stato.

**Nota dominio:** redesign visivo → ciclo = `npm run build` + visivo PENDING. No unit test.
