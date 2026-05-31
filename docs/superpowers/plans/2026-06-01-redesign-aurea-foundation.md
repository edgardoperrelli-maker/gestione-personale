# Redesign Aurea · Fase 0 — Fondazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare l'app al tema **Aurea dark** (token neon, font Geist, primitive con glow, sidebar navy, base dark-safe) ridefinendo i token in `globals.css` — re-skin token-driven, senza migrazione di libreria.

**Architecture:** I componenti usano già `var(--brand-*)`/`var(--kpi-*)`/`var(--sidebar-*)`. Ridefinendo questi token in `app/globals.css` (valori **OKLch** Aurea dark) gran parte dell'app si ritematizza da sola. Si aggiunge una base "dark-safe" (input/tabelle/label) e piccole rifiniture (glow/raggi) alle primitive. I colori hardcoded dei moduli restano alle fasi successive.

**Tech Stack:** Tailwind 4 + CSS variables, font Geist, OKLch. **Niente unit test** (è tema/CSS): verifica = `npx tsc --noEmit` + `npm run build` + controllo visivo manuale.

**Spec:** `docs/superpowers/specs/2026-06-01-redesign-aurea-foundation-design.md`

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `app/globals.css` | Token `:root` Aurea dark + body gradient + base dark-safe + (rimozione import Inter) | Modify |
| `app/layout.tsx` | Font Inter → Geist | Modify |
| `components/Button.tsx` | Glow sul primario | Modify |
| `components/Card.tsx` | Bordo/alone neon su hover | Modify |
| `components/layout/AppShell.tsx` | Sidebar navy + voce attiva cyan (token-driven; verificare) | Modify |
| `AGENTS.md` | §6 Design System → token/font Aurea | Modify |

> Nota: `Badge.tsx`, `Input.tsx`, `Tabs.tsx` usano già i token → si ritematizzano da soli; nessuna modifica necessaria (verificare a video).

---

## Task 1: `globals.css` — token `:root` Aurea dark + body gradient

**Files:** Modify `app/globals.css`

- [ ] **Step 1: Sostituire l'intero blocco `:root { … }`** (i valori colore attuali, rosso/chiaro) con questo (Aurea dark, OKLch). Mantieni i nomi dei token; cambiano solo i valori. Mantieni invariato il blocco `@theme inline { … }` che segue.

```css
:root {
  /* ── Sidebar (navy profondo Aurea) ── */
  --sidebar-bg-from: oklch(0.12 0.04 245);
  --sidebar-bg-to:   oklch(0.10 0.04 250);
  --sidebar-border:  oklch(0.30 0.03 245 / 0.6);
  --sidebar-text:    oklch(0.94 0.015 220);
  --sidebar-muted:   oklch(0.62 0.03 245);

  /* ── Brand (cyan neon) ── */
  --brand-bg:             oklch(0.14 0.04 245);
  --brand-surface:        oklch(0.18 0.05 245);
  --brand-surface-muted:  oklch(0.16 0.045 245);

  --brand-primary:        oklch(0.80 0.16 215);
  --brand-primary-hover:  oklch(0.72 0.16 215);
  --brand-primary-soft:   oklch(0.80 0.16 215 / 0.15);
  --brand-primary-border: oklch(0.80 0.16 215 / 0.40);
  --brand-nav-active-bg:  oklch(0.80 0.16 215 / 0.14);

  --brand-gold:           oklch(0.84 0.18 95);
  --brand-gold-soft:      oklch(0.84 0.18 95 / 0.16);

  /* accenti neon aggiuntivi */
  --brand-magenta:        oklch(0.70 0.25 350);
  --brand-magenta-soft:   oklch(0.70 0.25 350 / 0.16);
  --brand-green:          oklch(0.74 0.21 145);
  --brand-green-soft:     oklch(0.74 0.21 145 / 0.16);
  --brand-violet:         oklch(0.62 0.22 295);
  --brand-violet-soft:    oklch(0.62 0.22 295 / 0.16);

  --brand-border:         oklch(0.30 0.03 245);
  --brand-border-strong:  oklch(0.38 0.04 245);

  --brand-text-main:      oklch(0.94 0.015 220);
  --brand-text-muted:     oklch(0.70 0.03 245);
  --brand-text-subtle:    oklch(0.55 0.03 245);

  /* ── KPI → accenti neon (bg = neon/α, text/icon = neon) ── */
  --kpi-rosso-bg:        oklch(0.80 0.16 215 / 0.16);
  --kpi-rosso-text:      oklch(0.86 0.12 215);
  --kpi-rosso-icon:      oklch(0.80 0.16 215);
  --kpi-giallo-bg:       oklch(0.84 0.18 95 / 0.16);
  --kpi-giallo-text:     oklch(0.88 0.13 95);
  --kpi-giallo-icon:     oklch(0.84 0.18 95);
  --kpi-terracotta-bg:   oklch(0.70 0.25 350 / 0.16);
  --kpi-terracotta-text: oklch(0.82 0.16 350);
  --kpi-terracotta-icon: oklch(0.70 0.25 350);
  --kpi-grafite-bg:      oklch(0.74 0.21 145 / 0.16);
  --kpi-grafite-text:    oklch(0.84 0.16 145);
  --kpi-grafite-icon:    oklch(0.74 0.21 145);

  /* ── Semantici ── */
  --success:      oklch(0.74 0.21 145);
  --success-soft: oklch(0.74 0.21 145 / 0.16);
  --warning:      oklch(0.84 0.18 95);
  --warning-soft: oklch(0.84 0.18 95 / 0.16);
  --danger:       oklch(0.70 0.25 350);
  --danger-soft:  oklch(0.70 0.25 350 / 0.16);
  --info:         oklch(0.80 0.16 215);
  --info-soft:    oklch(0.80 0.16 215 / 0.16);

  /* ── Calendario ── */
  --app-bg:     oklch(0.14 0.04 245);
  --card-bg:    oklch(0.18 0.05 245);
  --card-bd:    oklch(0.30 0.03 245);
  --we-bg:      oklch(0.16 0.045 245);
  --hol-bg:     oklch(0.70 0.25 350 / 0.12);
  --today-ring: oklch(0.80 0.16 215);

  /* ── Ombre + glow ── */
  --shadow-sm:    0 1px 2px rgba(0,0,0,0.40);
  --shadow-md:    0 2px 10px rgba(0,0,0,0.45);
  --shadow-lg:    0 10px 30px rgba(0,0,0,0.50);
  --shadow-hover: 0 0 18px oklch(0.80 0.16 215 / 0.45);

  /* ── Legacy ── */
  --text-gold-soft: oklch(0.70 0.03 245);
  --border-light:   oklch(0.30 0.03 245);
}
```

- [ ] **Step 2: Aggiornare il `body`** (sfondo gradiente Aurea). Sostituire la regola `body { background-color: …; color: …; … }` con:

```css
body {
  background:
    radial-gradient(circle at top left, oklch(0.78 0.13 215 / 0.16), transparent 38%),
    radial-gradient(circle at top right, oklch(0.66 0.22 350 / 0.10), transparent 42%),
    linear-gradient(180deg, oklch(0.14 0.04 245) 0%, oklch(0.10 0.04 245) 100%);
  background-attachment: fixed;
  color: var(--brand-text-main);
  font-family: var(--font-geist), "Geist", system-ui, -apple-system, sans-serif;
  line-height: 1.35;
}
```

- [ ] **Step 3: Verifica** `npx tsc --noEmit` (clean) e `npm run build` (success).
- [ ] **Step 4: Commit** `git add app/globals.css && git commit -m "feat(redesign): token globals.css → Aurea dark (cyan/neon) + body gradient"`

---

## Task 2: `globals.css` — base dark-safe + rimozione import Inter

**Files:** Modify `app/globals.css`

- [ ] **Step 1: Rimuovere** la riga `@import url("https://fonts.googleapis.com/css2?family=Inter…");` in cima al file (il font passa a Geist via `next/font`, Task 3).

- [ ] **Step 2: Sostituire le regole base chiare** con versioni dark/token. Trova e sostituisci:
```css
input, select, textarea {
  background-color: #ffffff;
  color: #0f172a;
  border: 1px solid var(--brand-border);
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 1px var(--brand-primary);
}
label { color: #0f172a; }
table { color: #0f172a; background-color: #ffffff; }
th, td { border-color: var(--brand-border); }
```
con:
```css
input, select, textarea {
  background-color: var(--brand-surface);
  color: var(--brand-text-main);
  border: 1px solid var(--brand-border);
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 1px var(--brand-primary);
}
input::placeholder, textarea::placeholder { color: var(--brand-text-subtle); }
label { color: var(--brand-text-main); }
table { color: var(--brand-text-main); background-color: var(--brand-surface); }
th, td { border-color: var(--brand-border); }
```

- [ ] **Step 3: Scrollbar scura** — sostituire i colori chiari della scrollbar globale:
```css
* { scrollbar-width: thin; scrollbar-color: var(--brand-border) transparent; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background-color: var(--brand-border-strong); border: 2px solid transparent; border-radius: 999px; }
*::-webkit-scrollbar-thumb:hover { background-color: var(--brand-primary); }
```

- [ ] **Step 4: Verifica** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** `git add app/globals.css && git commit -m "feat(redesign): base dark-safe (input/tabelle/label/scrollbar) + rimuovi import Inter"`

---

## Task 3: Font Geist (`app/layout.tsx`)

**Files:** Modify `app/layout.tsx`

- [ ] **Step 1: Sostituire l'intero contenuto** con (Geist al posto di Inter):
```tsx
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { PageTransitionWrapper } from '@/components/layout/PageTransitionWrapper';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gestione Personale',
  description: 'Pianificazione operatori e rapportini.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={`${geist.variable} antialiased bg-[var(--brand-bg)] text-[var(--brand-text-main)]`}>
        <PageTransitionWrapper>{children}</PageTransitionWrapper>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verifica** `npm run build` (Geist scaricato/risolto da next/font; success).
- [ ] **Step 3: Commit** `git add app/layout.tsx && git commit -m "feat(redesign): font Geist al posto di Inter"`

---

## Task 4: Primitive — glow Button + hover neon Card

**Files:** Modify `components/Button.tsx`, `components/Card.tsx`

- [ ] **Step 1: Button — glow sul primario.** In `components/Button.tsx`, nella mappa `variantClasses`, sostituire la riga `primary`:
```ts
  primary: 'bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]',
```
con:
```ts
  primary: 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)] shadow-[0_0_16px_oklch(0.80_0.16_215/0.45)] hover:bg-[var(--brand-primary-hover)] hover:shadow-[0_0_22px_oklch(0.80_0.16_215/0.6)]',
```

- [ ] **Step 2: Card — bordo/alone neon su hover.** In `components/Card.tsx`, nella costante `classes`, sostituire:
```ts
  const classes = `rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm ${className}`;
```
con:
```ts
  const classes = `rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm transition hover:border-[var(--brand-primary-border)] hover:shadow-[var(--shadow-hover)] ${className}`;
```

- [ ] **Step 3: Verifica** `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 4: Commit** `git add components/Button.tsx components/Card.tsx && git commit -m "feat(redesign): glow primario + hover neon su Card"`

---

## Task 5: Sidebar (AppShell) — navy + voce attiva cyan

**Files:** Modify `components/layout/AppShell.tsx`

- [ ] **Step 1: Leggere** `components/layout/AppShell.tsx`. La sidebar usa i token `--sidebar-*` (già ridefiniti in Task 1 → diventa navy automaticamente). Verificare che NON ci siano colori sidebar hardcoded (es. `bg-[#…]`, `text-rose-…`); se presenti, convertirli ai token `--sidebar-*`.
- [ ] **Step 2: Voce di menu ATTIVA** → look cyan: assicurarsi che lo stato attivo usi `bg-[var(--brand-nav-active-bg)]` + testo `text-[var(--brand-primary)]` (eventuale glow leggero). Se attualmente usa un colore diverso hardcoded, sostituirlo con questi token.
- [ ] **Step 3: Verifica** `npm run build` + (al PC) controllo visivo della sidebar (navy, voce attiva cyan, testo leggibile).
- [ ] **Step 4: Commit** `git add components/layout/AppShell.tsx && git commit -m "feat(redesign): sidebar navy Aurea + voce attiva cyan"`

> Se AppShell è già interamente token-driven (nessun colore hardcoded), questo task è una semplice verifica: in tal caso committa un no-op documentale o salta il commit, segnalandolo.

---

## Task 6: Aggiornare `AGENTS.md §6` (Design System)

**Files:** Modify `AGENTS.md`

- [ ] **Step 1: Sostituire la sezione "### CSS Variables (da globals.css)" e "### Font"** del §6 con i valori Aurea dark aggiornati:
```md
### CSS Variables (da globals.css) — tema Aurea dark (OKLch)
--brand-bg:            oklch(0.14 0.04 245)   /* navy */
--brand-surface:       oklch(0.18 0.05 245)   /* card */
--brand-primary:       oklch(0.80 0.16 215)   /* cyan neon */
--brand-text-main:     oklch(0.94 0.015 220)
--brand-border:        oklch(0.30 0.03 245)
--brand-magenta / --brand-green / --brand-violet / --brand-gold  /* accenti neon */
--sidebar-bg-from:     oklch(0.12 0.04 245)   /* sidebar navy profondo */

### Font
- **Geist** — body e UI (via next/font/google, variabile --font-geist)
```
(Aggiornare anche i pattern card/bottone se citano `bg-white` → `bg-[var(--brand-surface)]`.)

- [ ] **Step 2: Commit** `git add AGENTS.md && git commit -m "docs(redesign): AGENTS.md §6 aggiornato a token Aurea dark"`

---

## Verifica finale (al PC)

Dopo tutti i task: `npm run dev` e controllare in **dark** — hub, login, una pagina con form/tabella, la sidebar: leggibili e coerenti; bottoni/card/badge con look neon Aurea; nessun testo scuro-su-scuro nei componenti condivisi. I dettagli specifici dei moduli (mappa ecc.) possono ancora essere imperfetti → fasi successive.

## Self-review notes (per chi esegue)

- **Copertura spec:** token §3 → Task 1; font §4 → Task 3; primitive §5 → Task 4; sidebar §6 → Task 5; dark-safe §7 → Task 2; AGENTS §8-doc → Task 6. KPI/neon per card → Task 1 (token KPI). Tutto coperto.
- **Coerenza:** i nomi dei token restano invariati (solo valori cambiano) → nessuna rottura di riferimenti nei componenti. Le primitive non-toccate (Badge/Input/Tabs) si ritematizzano via token.
- **`@theme inline`:** lasciarlo invariato (mappa `--color-*` ai var). Opzionale: aggiungere `--color-brand-magenta/green/violet` se servono utility Tailwind dirette (non necessario in Fase 0).
- **Rischio basso, build-verificabile:** ogni task chiude con build verde; la resa estetica esatta si valida a video al PC (gli agenti non possono).
