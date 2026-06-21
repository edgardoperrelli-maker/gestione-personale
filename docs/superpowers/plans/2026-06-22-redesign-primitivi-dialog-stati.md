# Redesign sobrio — Piano 2: Primitivi + Dialog + stati Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Portare i primitivi UI (`Button/Card/Input/Badge/Tabs` + nuovi `Select/Textarea`) allo stile sobrio, creare un primitivo `Dialog` accessibile, e tokenizzare i pallini di stato (live/mappa/agente/TodayMap) con i token `--status-*` aggiunti nel Piano 1.

**Architecture:** I primitivi esistono in `components/*.tsx` e sono già token-driven (post sweep S2 usano `var(--on-primary)`). Si raffinano in place (varianti sobrie, focus ring 2px, raggi della scala, Tabs underline) e si aggiungono `components/ui/{Select,Textarea,Dialog}.tsx`. I pallini hardcoded (`#22c55e`, `#ef4444`, …) diventano `var(--status-*)`; Leaflet (che non legge `var()` in JS) li risolve a runtime con `getComputedStyle`.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, framer-motion, Leaflet. Verifica: `npm run build` + controllo visivo (login-gated, PENDING come nel Piano 1).

## Global Constraints

- Nessuna SQL, nessuna logica/dati/API/permessi toccati.
- **Props/forme compatibili** coi call-site esistenti: NON rimuovere varianti/prop esistenti; aggiungere è ok. `Button` deve continuare ad accettare `variant="outline"|"gold"` ecc.
- Token NAMES stabili; usare i token del Piano 1 (`--on-primary`, `--primary-text`, `--status-*`(+soft), `--brand-*`, semantici).
- Branch `restyle/aurea-light`. NON toccare i file acea non committati (`tools/*.mjs`, `app/api/agente/acea-assegnazioni/route.ts`, `.claude/*`, `AGENTS.md`). Commit mirati per task. Niente push senza ok.
- Verifica = `npm run build` (gate) + visivo PENDING. No unit test (i primitivi non hanno render-test setup; non aggiungere dipendenze).

---

## File Structure

| File | Azione |
|---|---|
| `components/Button.tsx` | Modify (Task 1) — varianti sobrie + `danger` + `secondary` alias + `gold` sobrio |
| `components/Card.tsx` | Modify (Task 1) — raggio xl, `CardFooter` |
| `components/Input.tsx` | Modify (Task 2) — focus ring 2px, raggio md, `error` |
| `components/ui/Select.tsx` | Create (Task 2) |
| `components/ui/Textarea.tsx` | Create (Task 2) |
| `components/Badge.tsx` | Modify (Task 3) — varianti stato `ok/ko/warn/idle/progress` |
| `components/Tabs.tsx` | Modify (Task 3) — stile underline |
| `components/ui/Dialog.tsx` | Create (Task 4) — modale a11y |
| `components/modules/agente/AgenteClient.tsx` | Modify (Task 5) — 2 pallini → `--status-*` |
| `components/modules/live/TorreMappa.tsx` | Modify (Task 5) — 6 const colore → `--status-*` |
| `components/modules/live/LiveClient.tsx` | Modify (Task 5) — dot fields + 1 pallino → `--status-*` |
| `components/modules/dashboard/TodayMapLeaflet.tsx` | Modify (Task 5) — marker via `getComputedStyle` |

---

## Task 1: Button + Card sobri

**Files:** Modify `components/Button.tsx`, `components/Card.tsx`

**Interfaces produced:** `Button` con varianti `primary|secondary|outline|ghost|soft|danger|gold` (size sm/md/lg); `Card` + `CardHeader`/`CardContent`/`CardFooter`.

- [ ] **Step 1: Button — varianti sobrie.** Sostituisci `variantClasses` e il tipo `ButtonVariant` in `components/Button.tsx`:

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'danger' | 'gold';
```
```tsx
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-primary)] text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)]',
  secondary: 'border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  outline: 'border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  ghost: 'text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]',
  soft: 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)] hover:bg-[var(--brand-primary-border)]',
  danger: 'bg-[var(--danger)] text-[var(--on-danger)] hover:opacity-90',
  gold: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)] border border-[var(--brand-border-strong)] hover:bg-[var(--brand-surface)]',
};
```

- [ ] **Step 2: Button — raggio e focus.** Nella stringa `classes` (riga ~32) cambia `rounded-xl` → `rounded-[var(--radius-md)]` (resta tutto il resto, incluso `focus:ring-2 focus:ring-[var(--brand-primary)]`). Rimuovi le classi glow residue dalla variante primary (già fatto nello Step 1: niente più `shadow-[var(--btn-primary-glow)]`).

- [ ] **Step 3: Build.** Run `npm run build` → deve passare.

- [ ] **Step 4: Card — raggio + footer.** In `components/Card.tsx`: nella `classes` (riga 13) cambia `rounded-2xl` → `rounded-[var(--radius-xl)]` e `shadow-sm` → `shadow-[var(--shadow-sm)]`. Aggiungi in fondo al file:

```tsx
export function CardFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-t border-[var(--brand-border)] px-4 py-3 ${className}`} {...props} />;
}
```

- [ ] **Step 5: Build + commit.** Run `npm run build` (pass). Poi:
```bash
git add components/Button.tsx components/Card.tsx
git commit -m "feat(restyle): Button/Card sobri (varianti danger/secondary, raggi scala, CardFooter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Input + Select + Textarea

**Files:** Modify `components/Input.tsx`; Create `components/ui/Select.tsx`, `components/ui/Textarea.tsx`

**Interfaces produced:** `Input` (prop opzionale `error?: boolean`), `Select`, `Textarea` (stessa forma, `error?`).

- [ ] **Step 1: Input — focus 2px, raggio md, error.** Sostituisci interamente `components/Input.tsx`:

```tsx
import * as React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean };

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', error = false, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={error || undefined}
    className={`w-full rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none focus:ring-2 ${
      error
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
        : 'border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:ring-[var(--brand-primary)]'
    } ${className}`}
    {...props}
  />
));

Input.displayName = 'Input';

export default Input;
```

- [ ] **Step 2: Create `components/ui/Select.tsx`.**

```tsx
import * as React from 'react';

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean };

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className = '', error = false, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={error || undefined}
    className={`w-full rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:outline-none focus:ring-2 ${
      error
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
        : 'border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:ring-[var(--brand-primary)]'
    } ${className}`}
    {...props}
  />
));

Select.displayName = 'Select';

export default Select;
```

- [ ] **Step 3: Create `components/ui/Textarea.tsx`.**

```tsx
import * as React from 'react';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean };

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', error = false, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={error || undefined}
    className={`w-full rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:outline-none focus:ring-2 ${
      error
        ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
        : 'border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:ring-[var(--brand-primary)]'
    } ${className}`}
    {...props}
  />
));

Textarea.displayName = 'Textarea';

export default Textarea;
```

- [ ] **Step 4: Build + commit.** Run `npm run build` (pass). Poi:
```bash
git add components/Input.tsx components/ui/Select.tsx components/ui/Textarea.tsx
git commit -m "feat(restyle): Input focus 2px+error + nuovi Select/Textarea sobri

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Badge (stati) + Tabs (underline)

**Files:** Modify `components/Badge.tsx`, `components/Tabs.tsx`

**Interfaces produced:** `Badge` con varianti aggiuntive `ok|ko|warn|idle|progress`; `Tabs` reso a sottolineatura (stessa API `value/onValueChange/items`).

- [ ] **Step 1: Badge — varianti di stato.** In `components/Badge.tsx` aggiungi al tipo `BadgeVariant` i valori `'ok' | 'ko' | 'warn' | 'idle' | 'progress'` e a `variantClasses` le righe:

```tsx
  ok: 'bg-[var(--status-ok-soft)] text-[var(--status-ok)]',
  ko: 'bg-[var(--status-ko-soft)] text-[var(--status-ko)]',
  warn: 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]',
  idle: 'bg-[var(--status-idle-soft)] text-[var(--status-idle)]',
  progress: 'bg-[var(--status-progress-soft)] text-[var(--status-progress)]',
```
(Lascia invariate le varianti esistenti e il default `primary`.)

- [ ] **Step 2: Tabs — stile underline.** Sostituisci il `return` di `components/Tabs.tsx` (righe 16-38) con:

```tsx
  return (
    <div className={`inline-flex items-end gap-1 border-b border-[var(--brand-border)] ${className}`}>
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onValueChange(item.value)}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
              active
                ? 'border-[var(--brand-primary)] text-[var(--primary-text)]'
                : 'border-transparent text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
```

- [ ] **Step 3: Build + commit.** Run `npm run build` (pass). Poi:
```bash
git add components/Badge.tsx components/Tabs.tsx
git commit -m "feat(restyle): Badge varianti stato + Tabs underline sobri

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Dialog primitivo accessibile

**Files:** Create `components/ui/Dialog.tsx`

**Interfaces produced:** `Dialog` controllato — props `{ open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; variant?: 'center' | 'sheet' }`. Overlay `--overlay`, focus-trap, ESC, click-overlay, `role="dialog"`/`aria-modal`/`aria-labelledby`, ripristino focus.

- [ ] **Step 1: Create `components/ui/Dialog.tsx`.**

```tsx
'use client';

import * as React from 'react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'center' | 'sheet';
  className?: string;
};

export default function Dialog({ open, onClose, title, children, footer, variant = 'center', className = '' }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const position = variant === 'sheet' ? 'items-end sm:items-center' : 'items-center';
  const panelShape =
    variant === 'sheet'
      ? 'w-full sm:max-w-lg rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)]'
      : 'w-full max-w-lg rounded-[var(--radius-xl)]';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${position} p-0 sm:p-4`}
      style={{ background: 'var(--overlay)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`flex max-h-[90dvh] flex-col border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-lg)] focus:outline-none ${panelShape} ${className}`}
      >
        {title != null && (
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-4 py-3">
            <h2 id={titleId} className="text-base font-semibold text-[var(--brand-text-main)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="rounded-[var(--radius-md)] p-1 text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer != null && (
          <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build.** Run `npm run build` → deve passare (il componente è autoconsistente; nessun import esterno oltre React).

- [ ] **Step 3: Commit.**
```bash
git add components/ui/Dialog.tsx
git commit -m "feat(restyle): primitivo Dialog accessibile (focus-trap, ESC, aria-modal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> La migrazione delle modali ad-hoc a `Dialog` avviene nei piani delle pagine (S6), una alla volta con verifica. Questo task crea solo il primitivo.

---

## Task 5: Token di stato sui pallini

**Files:** Modify `components/modules/agente/AgenteClient.tsx`, `components/modules/live/TorreMappa.tsx`, `components/modules/live/LiveClient.tsx`, `components/modules/dashboard/TodayMapLeaflet.tsx`

**Interfaces consumed:** `--status-ok/ko/warn/progress/idle` (Piano 1).

- [ ] **Step 1: AgenteClient — 2 pallini.** In `components/modules/agente/AgenteClient.tsx`:
  - riga 151: `backgroundColor: form.enabled ? '#22c55e' : '#9ca3af'` → `backgroundColor: form.enabled ? 'var(--status-ok)' : 'var(--status-idle)'`
  - riga 234: `backgroundColor: stato.online ? '#22c55e' : '#9ca3af'` → `backgroundColor: stato.online ? 'var(--status-ok)' : 'var(--status-idle)'`

- [ ] **Step 2: TorreMappa — costanti colore.** In `components/modules/live/TorreMappa.tsx` (righe 10-15) sostituisci i 6 hex:

```tsx
  ok: 'var(--status-ok)',
  ko: 'var(--status-ko)',
  attesa: 'var(--status-warn)',
  corso: 'var(--status-progress)',
  annullato: 'var(--status-idle)',
  da_assegnare: 'var(--status-idle)',
```

⚠️ **Se questi colori vengono passati a Leaflet** (marker su mappa): Leaflet non risolve `var()` in JS. Verifica come sono usati: se finiscono in `L.circleMarker`/`divIcon` come stringa colore, NON usare `var()` — invece risolvili a runtime (vedi pattern Step 4) leggendo `getComputedStyle(document.documentElement).getPropertyValue('--status-ok').trim()` una volta al mount. Se invece sono usati solo in CSS/`style` di elementi DOM (pallini legenda), `var()` va bene. Ispeziona prima di scegliere; riporta quale caso è.

- [ ] **Step 3: LiveClient — dot fields + pallino.** In `components/modules/live/LiveClient.tsx`:
  - righe 16-21: nei campi `dot:` sostituisci `'#22c55e'`→`'var(--status-ok)'`, `'#ef4444'`→`'var(--status-ko)'`, `'#fbbf24'`→`'var(--status-warn)'`, `'#38bdf8'`→`'var(--status-progress)'`, `'#9ca3af'`→`'var(--status-idle)'` (due volte). I `dot` sono usati in pallini DOM `style={{ backgroundColor: dot }}` → `var()` ok (verifica che non vadano in Leaflet; in `LiveClient` la board è DOM, non mappa).
  - riga 173: `backgroundColor: live ? '#22c55e' : '#9ca3af'` → `backgroundColor: live ? 'var(--status-ok)' : 'var(--status-idle)'`
  - riga 19: anche `bg: 'rgba(56,189,248,0.12)'` (corso) → `bg: 'var(--status-progress-soft)'` per coerenza.

- [ ] **Step 4: TodayMapLeaflet — marker via getComputedStyle.** In `components/modules/dashboard/TodayMapLeaflet.tsx` i colori marker (righe 37, 39: `color: '#0ea5e9'`, `fillColor: '#22d3ee'`) vanno su Leaflet → risolvi a runtime. All'inizio della funzione/effetto che crea i marker (prima del loop che usa color/fillColor), aggiungi:

```tsx
const css = getComputedStyle(document.documentElement);
const markerColor = css.getPropertyValue('--status-progress').trim() || '#1570d1';
const markerFill = css.getPropertyValue('--brand-primary-soft').trim() || '#1570d1';
```
poi sostituisci `color: '#0ea5e9'` → `color: markerColor` e `fillColor: '#22d3ee'` → `fillColor: markerFill`. NON toccare il resto della mappa (tileLayer, fitBounds, popup, cleanup). Posiziona la lettura dentro lo stesso `useEffect`/funzione che disegna i marker, così riflette il tema al (re)mount.

- [ ] **Step 5: Build + commit.** Run `npm run build` (pass). Verifica zero hex residui tra quelli toccati: `grep -rn "#22c55e\|#ef4444\|#fbbf24\|#38bdf8\|#0ea5e9\|#22d3ee" components/modules/agente/AgenteClient.tsx components/modules/live/TorreMappa.tsx components/modules/live/LiveClient.tsx components/modules/dashboard/TodayMapLeaflet.tsx` → 0. Poi:
```bash
git add components/modules/agente/AgenteClient.tsx components/modules/live/TorreMappa.tsx components/modules/live/LiveClient.tsx components/modules/dashboard/TodayMapLeaflet.tsx
git commit -m "feat(restyle): pallini stato -> token --status-* (live/torre/agente/TodayMap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (eseguita)

**1. Copertura spec (S3+S4):** Button/Card (T1), Input/Select/Textarea (T2), Badge/Tabs (T3) → S3 primitivi. Dialog (T4) → S4 primitivo modale. Token di stato applicati (T5) → S4 stati. Migrazione modali ad-hoc → rinviata ai piani pagina (S6), nota in T4.
**2. Placeholder scan:** nessun TBD; ogni step ha codice/edit completo. L'unico punto condizionale (T5 Step 2, Leaflet vs DOM in TorreMappa) è esplicitato con criterio di decisione e pattern di entrambi i rami — non è un placeholder ma un controllo richiesto.
**3. Coerenza nomi/tipi:** i token `--status-*`(+soft), `--on-primary`, `--primary-text`, `--radius-md/xl`, `--shadow-sm/lg`, `--overlay` usati qui sono definiti dal Piano 1 (verificato in `globals.css`). `Button`/`Tabs` continuano a esporre la stessa API; varianti solo aggiunte. `Dialog` props autoconsistenti.

**Nota dominio:** redesign visivo → ciclo = `npm run build` + visivo PENDING (login). No unit test.
