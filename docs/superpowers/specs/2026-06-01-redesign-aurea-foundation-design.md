# Design — Redesign Aurea · Fase 0: Fondazione (tema scuro)

- **Data:** 2026-06-01
- **Stato:** approvato (in attesa di revisione finale utente)
- **Fase:** 0 di N (fondazione). Le fasi successive (per-modulo) seguono la sequenza utente: **cronoprogramma → mappa → impostazioni → hotel → altri**.
- **Stack:** Next.js 15 · Tailwind 4 · CSS variables · font Geist · colori OKLch

---

## 1. Contesto e obiettivo

L'app oggi usa il brand **rosso Plenzich** (token `--brand-*` in `app/globals.css`, font Inter,
tema chiaro). Si vuole portarla al design del progetto gemello **Aurea**, in **tema scuro**:
sfondo navy, **cyan neon** primario, **accenti neon** (verde, ambra, viola, magenta), font
**Geist**, angoli arrotondati e ombre **glow**.

**Strategia decisa:** **ri-tematizzazione** dei componenti esistenti (NIENTE migrazione a
shadcn/Base UI). Poiché i componenti usano i token `--brand-*`/`--kpi-*`, **ridefinire i token
in `globals.css` re-skina automaticamente gran parte dell'app**. Questa Fase 0 fa la
fondazione; i colori **hardcoded** dei moduli (≈353 occorrenze, concentrate su mappa) si
rifiniscono nelle fasi per-modulo.

## 2. Scope

**In scope (Fase 0):**
- Ridefinizione token `globals.css` → palette **Aurea dark** (+ set **neon**).
- Font **Inter → Geist** (`app/layout.tsx` + `globals.css`).
- Primitive condivise ri-tematizzate: `Button`, `Card`, `Badge`, `Input`, `Tabs` (raggi + glow).
- **Card neon**: i temi card del hub e gli stati usano gli accenti neon Aurea.
- **Sidebar/layout** (`--sidebar-*`, `app/hub/layout.tsx`) → navy profondo.
- **Passata "dark-safe" globale**: conversione dei pattern chiari più frequenti (vedi §7) così l'app è leggibile in scuro ovunque da subito.
- Aggiornamento `AGENTS.md §6` (design system) ai nuovi token.

**Fuori scope (fasi successive):**
- Colori hardcoded specifici dei moduli (mappa `MappaOperatoriClient` 128, `RegistroPianificazioni` 30, sopralluoghi, hotel, dialoghi, ecc.) → rifiniti modulo per modulo.
- Tema chiaro / toggle (per ora solo dark).

## 3. Mappa token — `globals.css :root` → Aurea dark

> Valori in **OKLch** (come Aurea). I componenti già consumano questi nomi → cambiarli re-skina.

**Superfici e testo**
| Token | Attuale | → Aurea dark |
|---|---|---|
| `--brand-bg` | `#F7F3F3` | `oklch(0.14 0.04 245)` |
| `--brand-surface` | `#FFFFFF` | `oklch(0.18 0.05 245)` |
| `--brand-surface-muted` | `#FBF6F6` | `oklch(0.16 0.045 245)` |
| `--brand-border` | `#EBE0E0` | `oklch(0.30 0.03 245)` |
| `--brand-border-strong` | `#D8C6C6` | `oklch(0.38 0.04 245)` |
| `--brand-text-main` | `#201D1D` | `oklch(0.94 0.015 220)` |
| `--brand-text-muted` | `#7A6060` | `oklch(0.70 0.03 245)` |
| `--brand-text-subtle` | `#BFA7A7` | `oklch(0.55 0.03 245)` |

**Primario (cyan neon) + accenti**
| Token | → Aurea dark |
|---|---|
| `--brand-primary` | `oklch(0.80 0.16 215)` (cyan) |
| `--brand-primary-hover` | `oklch(0.72 0.16 215)` |
| `--brand-primary-soft` | `oklch(0.80 0.16 215 / 0.15)` |
| `--brand-primary-border` | `oklch(0.80 0.16 215 / 0.40)` |
| `--brand-nav-active-bg` | `oklch(0.80 0.16 215 / 0.14)` |
| `--brand-gold` / `--brand-gold-soft` | `oklch(0.84 0.18 95)` / `…/0.16` (ambra) |
| **nuovo** `--brand-magenta` / `-soft` | `oklch(0.70 0.25 350)` / `…/0.16` |
| **nuovo** `--brand-green` / `-soft` | `oklch(0.74 0.21 145)` / `…/0.16` |
| **nuovo** `--brand-violet` / `-soft` | `oklch(0.62 0.22 295)` / `…/0.16` |

**KPI / card neon** (oggi rosso/giallo/terracotta/grafite → 4 accenti neon; usati dalle card del hub e dai Badge)
| Token set | → Aurea dark (bg = neon/α, text/icon = neon) |
|---|---|
| `--kpi-rosso-*` | **cyan** `oklch(0.80 0.16 215 …)` |
| `--kpi-giallo-*` | **ambra** `oklch(0.84 0.18 95 …)` |
| `--kpi-terracotta-*` | **magenta** `oklch(0.70 0.25 350 …)` |
| `--kpi-grafite-*` | **verde** `oklch(0.74 0.21 145 …)` |
(bg ≈ `colore / 0.16`, text ≈ `colore` chiaro, icon ≈ `colore`)

**Stati semantici**
| Token | → |
|---|---|
| `--success` / `-soft` | `oklch(0.74 0.21 145)` / `…/0.16` |
| `--warning` / `-soft` | `oklch(0.84 0.18 95)` / `…/0.16` |
| `--danger` / `-soft` | `oklch(0.70 0.25 350)` / `…/0.16` |
| `--info` / `-soft` | `oklch(0.80 0.16 215)` / `…/0.16` |

**Sidebar (navy profondo) e calendario**
| Token | → |
|---|---|
| `--sidebar-bg-from` / `-to` | `oklch(0.12 0.04 245)` / `oklch(0.10 0.04 250)` |
| `--sidebar-text` | `oklch(0.94 0.015 220)` |
| `--sidebar-muted` | `oklch(0.62 0.03 245)` |
| `--sidebar-border` | `oklch(0.30 0.03 245 / 0.6)` |
| `--app-bg` / `--card-bg` / `--card-bd` | come `--brand-bg` / `--brand-surface` / `--brand-border` |

**Ombre → glow** e **sfondo**
- `--shadow-sm/md/lg/hover` → ombre scure + **glow cyan** sugli elementi interattivi (es. `--shadow-hover: 0 0 18px oklch(0.80 0.16 215 / 0.45)`).
- `body` background → **gradiente Aurea**: `radial-gradient(circle at top left, oklch(0.78 0.13 215/.16), transparent 38%) + radial-gradient(circle at top right, oklch(0.66 0.22 350/.10), transparent 42%) + linear-gradient(180deg, oklch(0.14 0.04 245), oklch(0.10 0.04 245))`.

## 4. Font Geist

- `app/layout.tsx`: sostituire `Inter` con `Geist` da `next/font/google` (`const geist = Geist({ variable: '--font-geist', subsets: ['latin'] })`), aggiornare la `className` del body (`${geist.variable}`).
- `globals.css`: rimuovere l'`@import` di Inter; impostare `font-family: var(--font-geist), "Geist", system-ui, sans-serif` su `body`. (Geist è già una dipendenza del progetto — pacchetto `geist`; in alternativa via `next/font/google`.)

## 5. Primitive ri-tematizzate

I componenti `components/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Tabs.tsx` già
usano i token → cambiano colore da soli. Rifiniture:
- **Button** primario: aggiungere **glow** (`box-shadow` cyan) e hover lift; varianti `outline/ghost/soft/gold` mantengono i nomi ma con i nuovi token.
- **Card**: bordo `--brand-border`, sfondo `--brand-surface`; variante "interattiva" con **bordo/alone neon** (cyan) on hover; angoli più arrotondati (`rounded-2xl`/`3xl`).
- **Badge**: pillola; le varianti `rosso/giallo/terracotta/grafite/success/warning/danger/gold` puntano già ai token KPI/semantici → diventano neon.
- **Input/Select/Textarea**: sfondo scuro `--brand-surface`, bordo `--brand-border`, focus ring cyan (vedi §7 per le regole base in `globals.css`).

## 6. Sidebar e layout

- I token `--sidebar-*` (navy) ri-tematizzano la sidebar esistente; verificare `app/hub/layout.tsx` / la shell e l'eventuale `.sidebar-scrollbar`.
- Voce/elemento attivo: sfondo `--brand-nav-active-bg` (cyan/α) + testo cyan, eventuale glow.

## 7. Passata "dark-safe" globale

In `globals.css`, le regole base per input/tabelle sono oggi **chiare** (es. `input,select,textarea { background:#fff; color:#0f172a }`, `table { color:#0f172a; background:#fff }`, `label { color:#0f172a }`). Vanno portate a scuro/token:
- `input, select, textarea` → `background: var(--brand-surface); color: var(--brand-text-main); border-color: var(--brand-border)`; focus ring `--brand-primary`.
- `table` / `th,td` → colori token (testo chiaro, bordo `--brand-border`).
- `label` → `var(--brand-text-main)`.
- scrollbar → toni scuri.

Inoltre, una **sweep mirata** sui pattern chiari hardcoded più frequenti e a basso rischio
(globali, non per-modulo): `bg-white` → `bg-[var(--brand-surface)]`, `text-gray-900`/`text-slate-900`/`text-neutral-900` → `text-[var(--brand-text-main)]`, bordi chiari `border-gray-200/300` → `border-[var(--brand-border)]`, dove compaiono in componenti **condivisi/layout** (non nei moduli, che restano alle fasi loro). Obiettivo: leggibilità ovunque in dark, senza entrare nel dettaglio dei moduli.

## 8. File coinvolti

| File | Azione |
|---|---|
| `app/globals.css` | Ridefinire `:root` (token §3) + regole base dark-safe (§7) + body gradient |
| `app/layout.tsx` | Inter → Geist (§4) |
| `components/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `Tabs.tsx` | Rifiniture glow/raggi (§5) |
| `app/hub/layout.tsx` (+ shell) | Sidebar navy (§6) |
| `app/hub/page.tsx` | Le card hub usano i temi KPI neon (già token-based; verificare) |
| `AGENTS.md` | Aggiornare §6 Design System ai nuovi token/font |

## 9. Verifica / testing

- Nessun unit test (è CSS/tema). Verifiche:
  - `npx tsc --noEmit` pulito, `npm run build` ok.
  - **Verifica visiva al PC** (`npm run dev`): hub, login, una pagina con form/tabella, la sidebar → leggibili e coerenti in dark; primitive (bottoni/card/badge) con look Aurea neon; nessun testo scuro-su-scuro nei componenti condivisi.
- Criterio di "fatto" per la Fase 0: l'app è **interamente leggibile in dark** e le **primitive + card** hanno l'aspetto Aurea; i dettagli specifici dei moduli possono ancora essere imperfetti (fasi successive).

## 10. Fasi successive (fuori da questa spec)

Redesign per-modulo (colori hardcoded + layout specifici), nell'ordine utente:
**cronoprogramma → mappa → impostazioni → hotel → poi dashboard, rapportini, sopralluoghi, login, ecc.** Ogni fase: suo spec → piano → implementazione, riusando i token/primitive di questa fondazione.
