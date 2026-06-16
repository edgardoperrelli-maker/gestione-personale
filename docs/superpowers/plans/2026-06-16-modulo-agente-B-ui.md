# Modulo "Agente" — Piano B: modulo UI (/hub/agente)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Il modulo admin `/hub/agente` con 4 card: Pianificazione, Stato, Storico, e **Colonne & scrittura** (colonne rilevate con nuove/sparite + editor mappa + testi esito).

**Architecture:** Pagina server (gate admin) che legge `agente_config` + `agente_run` + `agente_file_colonne` via session client; client con i form che salvano su `PUT /api/admin/agente/config` (definito nel Piano A).

**Tech Stack:** Next.js server/client components, TypeScript, variabili CSS `--brand-*`. Spec §1b/§5. **Dipende dal Piano A** (DB + `PUT /api/admin/agente/config` + tipi mappatura).

---

### Task D1 — `lib/moduleAccess.ts`: chiave `'agente'` + voce in `APP_MODULES`

Aggiunge il modulo `agente` al registro accessi: nuova chiave nel union `AppModuleKey` e nuova voce in `APP_MODULES` con `adminOnly: true` + `requiresAdminRole: true` (gate forte di ruolo, come `impostazioni`).

**Files**
- `lib/moduleAccess.ts` (modifica)
- `lib/__tests__/moduleAccess.agente.test.ts` (nuovo)

**Step**
- [ ] Scrivi il test `lib/__tests__/moduleAccess.agente.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  APP_MODULES,
  ALL_MODULE_KEYS,
  DEFAULT_ALLOWED_MODULES,
  canAccessPath,
  findModuleByPath,
} from '@/lib/moduleAccess';

describe('modulo agente', () => {
  it('è registrato in APP_MODULES con i flag corretti', () => {
    const mod = APP_MODULES.find((m) => m.key === 'agente');
    expect(mod).toBeDefined();
    expect(mod?.href).toBe('/hub/agente');
    expect(mod?.section).toBe('modules');
    expect(mod?.adminOnly).toBe(true);
    expect(mod?.requiresAdminRole).toBe(true);
    expect(mod?.matchPrefixes).toContain('/hub/agente');
  });

  it('è incluso in ALL_MODULE_KEYS', () => {
    expect(ALL_MODULE_KEYS).toContain('agente');
  });

  it('NON è nei default operatore (adminOnly)', () => {
    expect(DEFAULT_ALLOWED_MODULES).not.toContain('agente');
  });

  it('findModuleByPath riconosce le sotto-rotte', () => {
    expect(findModuleByPath('/hub/agente')?.key).toBe('agente');
    expect(findModuleByPath('/hub/agente/storico')?.key).toBe('agente');
  });

  it('gate forte: un operatore non accede anche se la chiave è nei moduli', () => {
    expect(canAccessPath('/hub/agente', ['agente'], 'operatore')).toBe(false);
    expect(canAccessPath('/hub/agente', ['agente'], 'admin')).toBe(true);
  });

  it('admin senza la chiave nei moduli non accede', () => {
    expect(canAccessPath('/hub/agente', [], 'admin')).toBe(false);
  });
});
```
- [ ] Verifica che il test FALLISCA (chiave non ancora dichiarata):
```
npx vitest run lib/__tests__/moduleAccess.agente.test.ts
```
Atteso: errori TS/asserzioni rosse (`agente` non in `AppModuleKey` / `mod` undefined).
- [ ] In `lib/moduleAccess.ts`, aggiungi `'agente'` al union `AppModuleKey`. Sostituisci:
```ts
  | 'misuratori'
  | 'impostazioni';
```
con:
```ts
  | 'misuratori'
  | 'agente'
  | 'impostazioni';
```
- [ ] Aggiorna il commento del flag `requiresAdminRole` (oggi cita solo `impostazioni`). Sostituisci:
```ts
  /** Gate FORTE di ruolo: l'accesso richiede ruolo admin. Solo `impostazioni`. */
  requiresAdminRole?: boolean;
```
con:
```ts
  /** Gate FORTE di ruolo: l'accesso richiede ruolo admin. Es. `impostazioni`, `agente`. */
  requiresAdminRole?: boolean;
```
- [ ] Inserisci la voce `agente` in `APP_MODULES`, subito PRIMA della voce `impostazioni`. Sostituisci:
```ts
  {
    key: 'impostazioni',
    href: '/impostazioni',
    label: 'Impostazioni',
    description: 'Utenze e configurazione accessi',
    section: 'system',
    matchPrefixes: ['/impostazioni'],
    adminOnly: true,
    requiresAdminRole: true,
  },
];
```
con:
```ts
  {
    key: 'agente',
    href: '/hub/agente',
    label: 'Agente',
    description: 'Pianificazione e feedback sync limitazioni massive',
    section: 'modules',
    matchPrefixes: ['/hub/agente'],
    adminOnly: true,
    requiresAdminRole: true,
  },
  {
    key: 'impostazioni',
    href: '/impostazioni',
    label: 'Impostazioni',
    description: 'Utenze e configurazione accessi',
    section: 'system',
    matchPrefixes: ['/impostazioni'],
    adminOnly: true,
    requiresAdminRole: true,
  },
];
```
- [ ] Verifica che il test PASSI:
```
npx vitest run lib/__tests__/moduleAccess.agente.test.ts
```
Atteso: `6 passed`.
- [ ] Verifica che non ci siano NUOVI errori di tipo (la baseline è già rossa, controlla solo che non spunti `agente`):
```
npx tsc --noEmit
```
Atteso: nessun errore che cita `agente` o `moduleAccess`.
- [ ] Commit:
```
git add lib/moduleAccess.ts lib/__tests__/moduleAccess.agente.test.ts
git commit -m "feat(agente): registra il modulo agente in moduleAccess (admin-only, gate ruolo)"
```

---

### Task D2 — `components/layout/moduleIcons.tsx`: icona `agente`

Aggiunge l'icona del modulo. `MODULE_ICONS` è un `Record<AppModuleKey, ReactNode>` ESAUSTIVO: con la nuova chiave `agente` il file NON compila finché non aggiungi la voce — il test lo dimostra.

**Files**
- `components/layout/moduleIcons.tsx` (modifica)
- `components/layout/__tests__/moduleIcons.agente.test.tsx` (nuovo)

**Step**
- [ ] Scrivi il test `components/layout/__tests__/moduleIcons.agente.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';
import { ALL_MODULE_KEYS } from '@/lib/moduleAccess';

describe('MODULE_ICONS', () => {
  it('ha una voce per agente', () => {
    expect(MODULE_ICONS.agente).toBeDefined();
    expect(isValidElement(MODULE_ICONS.agente)).toBe(true);
  });

  it('copre TUTTE le chiavi modulo (record esaustivo)', () => {
    for (const key of ALL_MODULE_KEYS) {
      expect(MODULE_ICONS[key], `manca icona per ${key}`).toBeDefined();
    }
  });
});
```
- [ ] Verifica che il test FALLISCA:
```
npx vitest run components/layout/__tests__/moduleIcons.agente.test.tsx
```
Atteso: rosso (`MODULE_ICONS.agente` undefined / errore TS sul record incompleto).
- [ ] In `components/layout/moduleIcons.tsx`, aggiungi la voce `agente` PRIMA della voce `impostazioni`. Sostituisci:
```tsx
  impostazioni: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
```
con:
```tsx
  agente: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 5v3" />
      <circle cx="12" cy="4" r="1.5" />
      <path d="M9 13h.01M15 13h.01" />
      <path d="M2 13v2M22 13v2" />
    </svg>
  ),
  impostazioni: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
```
- [ ] Verifica che il test PASSI:
```
npx vitest run components/layout/__tests__/moduleIcons.agente.test.tsx
```
Atteso: `2 passed`.
- [ ] Commit:
```
git add components/layout/moduleIcons.tsx components/layout/__tests__/moduleIcons.agente.test.tsx
git commit -m "feat(agente): icona modulo agente in moduleIcons"
```

---

### Task D3 — Tipi condivisi e helper di presentazione: `lib/agente/uiTypes.ts`

Crea i tipi che la pagina server passa al client e i piccoli helper PURI di formattazione usati dalle card (testabili senza React). Tiene `AgenteClient` snello e copre con vitest la logica non-React (formattazione contatto, mapping report→righe).

**Files**
- `lib/agente/uiTypes.ts` (nuovo)
- `lib/agente/__tests__/uiTypes.test.ts` (nuovo)

**Step**
- [ ] Scrivi il test `lib/agente/__tests__/uiTypes.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  GIORNI_LABEL,
  formattaContatto,
  formattaIstante,
  badgeModalita,
} from '@/lib/agente/uiTypes';

describe('uiTypes helpers', () => {
  it('GIORNI_LABEL ha 7 etichette Lun..Dom in ordine ISO', () => {
    expect(GIORNI_LABEL).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  });

  it('formattaContatto: null → "mai"', () => {
    expect(formattaContatto(null)).toBe('mai');
  });

  it('formattaContatto: minuti → "N min fa"', () => {
    expect(formattaContatto(0)).toBe('adesso');
    expect(formattaContatto(5)).toBe('5 min fa');
    expect(formattaContatto(59)).toBe('59 min fa');
  });

  it('formattaContatto: ore intere', () => {
    expect(formattaContatto(60)).toBe('1 h fa');
    expect(formattaContatto(150)).toBe('2 h 30 min fa');
  });

  it('formattaContatto: oltre 24h → giorni', () => {
    expect(formattaContatto(60 * 26)).toBe('1 g 2 h fa');
  });

  it('formattaIstante: null → "—"', () => {
    expect(formattaIstante(null)).toBe('—');
  });

  it('formattaIstante: ISO → data/ora locale italiana', () => {
    const out = formattaIstante('2026-06-16T19:30:00.000Z');
    expect(out).toMatch(/16\/06\/2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it('badgeModalita riflette dry_run', () => {
    expect(badgeModalita(true)).toEqual({ label: 'Prova', tono: 'prova' });
    expect(badgeModalita(false)).toEqual({ label: 'Reale', tono: 'reale' });
  });
});
```
- [ ] Verifica che il test FALLISCA (modulo inesistente):
```
npx vitest run lib/agente/__tests__/uiTypes.test.ts
```
Atteso: rosso (`Cannot find module '@/lib/agente/uiTypes'`).
- [ ] Crea `lib/agente/uiTypes.ts` con codice reale:
```ts
import type { RegolaMappa } from '@/lib/agente/decisione';

/** Riga singleton agente_config letta dalla pagina server. */
export type AgenteConfigRow = {
  id: number;
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
  ultimo_giro_il: string | null;
  ultimo_contatto_il: string | null;
  ultima_rivendicazione_giorno: string | null;
  updated_at: string;
};

/** Riga storico agente_run letta dalla pagina server. */
export type AgenteRunRow = {
  id: string;
  creato_il: string;
  dry_run: boolean;
  lavori: number;
  aggiornate: number;
  extra: number;
  conflitti: number;
  non_collocate: number;
  errore: string | null;
  dettaglio: unknown;
};

/** Snapshot colonne rilevate per file (agente_file_colonne). */
export type AgenteFileColonneRow = {
  file: string;
  is_master: boolean;
  colonne: string[];
  colonne_nuove: string[];
  colonne_sparite: string[];
  rilevato_il: string;
};

/** Etichette giorni in ordine ISO 1=Lun..7=Dom (indice 0 = Lun). */
export const GIORNI_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

/** "N min fa" / "N h M min fa" / "N g H h fa" a partire dai minuti dall'ultimo contatto. */
export function formattaContatto(minuti: number | null): string {
  if (minuti === null) return 'mai';
  if (minuti <= 0) return 'adesso';
  if (minuti < 60) return `${minuti} min fa`;
  if (minuti < 60 * 24) {
    const h = Math.floor(minuti / 60);
    const m = minuti % 60;
    return m === 0 ? `${h} h fa` : `${h} h ${m} min fa`;
  }
  const g = Math.floor(minuti / (60 * 24));
  const h = Math.floor((minuti % (60 * 24)) / 60);
  return h === 0 ? `${g} g fa` : `${g} g ${h} h fa`;
}

/** ISO → "dd/MM/yyyy HH:mm" in fuso Europe/Rome. null → "—". */
export function formattaIstante(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}

export type BadgeModalita = { label: 'Prova' | 'Reale'; tono: 'prova' | 'reale' };

/** Badge Prova/Reale a partire dal flag dry_run. */
export function badgeModalita(dryRun: boolean): BadgeModalita {
  return dryRun ? { label: 'Prova', tono: 'prova' } : { label: 'Reale', tono: 'reale' };
}
```
- [ ] Verifica che il test PASSI:
```
npx vitest run lib/agente/__tests__/uiTypes.test.ts
```
Atteso: `9 passed`.
- [ ] Verifica nessun NUOVO errore TS (tollerato solo `lib/agente/decisione` se Part A non è ancora landata; in tal caso commenta i test che lo richiedono e riconferma dopo il merge):
```
npx eslint lib/agente/uiTypes.ts
```
Atteso: nessun errore su questo file.
- [ ] Commit:
```
git add lib/agente/uiTypes.ts lib/agente/__tests__/uiTypes.test.ts
git commit -m "feat(agente): tipi UI + helper formattazione contatto/istante/badge"
```

---

### Task D4 — Pagina server `app/hub/agente/page.tsx` (gate admin + caricamento dati + statoAgente)

Server component: replica il gate di `app/hub/live/page.tsx` (sessione → ruolo → moduli) MA esige il ruolo `admin` (gate forte); carica `agente_config` (singleton id=1), gli ultimi ~30 `agente_run` e tutte le righe `agente_file_colonne` via `supabaseAdmin`; calcola `statoAgente` lato server (fuso Rome) e passa tutto ad `AgenteClient`.

**Files**
- `app/hub/agente/page.tsx` (nuovo)

**Dipendenze (consumate, non autore):** `lib/agente/decisione.ts` (`statoAgente`, `RegolaMappa`), `lib/agente/orarioRoma.ts` (`partiRoma`), `lib/agente/uiTypes.ts` (Task D3), `components/modules/agente/AgenteClient.tsx` (Task D5/D6).

**Step**
- [ ] Crea `app/hub/agente/page.tsx` con codice reale:
```tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { statoAgente } from '@/lib/agente/decisione';
import { partiRoma } from '@/lib/agente/orarioRoma';
import AgenteClient from '@/components/modules/agente/AgenteClient';
import type {
  AgenteConfigRow,
  AgenteRunRow,
  AgenteFileColonneRow,
} from '@/lib/agente/uiTypes';

export const dynamic = 'force-dynamic';

/** Configurazione di default mostrata se la riga singleton non esiste ancora. */
const CONFIG_DEFAULT: AgenteConfigRow = {
  id: 1,
  enabled: true,
  giorni: [1, 2, 3, 4, 5],
  ora: '21:00',
  dry_run: true,
  finestra_giorni: 15,
  mappatura: [
    { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
    { campo: 'data', colonna: 'data prevista', abilitato: true },
    { campo: 'esito', colonna: 'esito', abilitato: true },
    { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
    { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
  ],
  esito_positivo: 'eseguito',
  esito_negativo: 'No',
  ultimo_giro_il: null,
  ultimo_contatto_il: null,
  ultima_rivendicazione_giorno: null,
  updated_at: new Date(0).toISOString(),
};

/** Minuti interi trascorsi dall'ultimo contatto (null se mai). */
function minutiDa(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 60000));
}

export default async function AgentePage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  // Gate forte: il modulo controlla un'automazione che scrive su SharePoint.
  if (role !== 'admin' || !allowedModules.includes('agente')) redirect('/hub');

  const [{ data: configRow }, { data: runRows }, { data: fileRows }] = await Promise.all([
    supabaseAdmin.from('agente_config').select('*').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('agente_run').select('*').order('creato_il', { ascending: false }).limit(30),
    supabaseAdmin.from('agente_file_colonne').select('*').order('file', { ascending: true }),
  ]);

  const config = (configRow ?? CONFIG_DEFAULT) as AgenteConfigRow;
  const runs = (runRows ?? []) as AgenteRunRow[];
  const files = (fileRows ?? []) as AgenteFileColonneRow[];

  const now = new Date();
  const { oggi, oraCorrente, weekday } = partiRoma(now);
  const stato = statoAgente({
    minutiDaContatto: minutiDa(config.ultimo_contatto_il, now),
    enabled: config.enabled,
    giorni: config.giorni,
    ora: config.ora,
    oraCorrente,
    weekday,
    ultimoGiroOggi: !!config.ultimo_giro_il && config.ultimo_giro_il.slice(0, 10) === oggi,
  });

  return (
    <AgenteClient
      config={config}
      runs={runs}
      files={files}
      stato={stato}
      minutiDaContatto={minutiDa(config.ultimo_contatto_il, now)}
    />
  );
}
```
- [ ] Verifica lint sul file (il file non gira a runtime senza Part A; il lint conferma import/JSX validi):
```
npx eslint app/hub/agente/page.tsx
```
Atteso: nessun errore (al più warning preesistenti di baseline). Se `lib/agente/decisione`/`orarioRoma` non sono ancora su questo branch, l'errore "Cannot find module" è atteso e si risolve al merge di Part A — NON aggirarlo con stub.
- [ ] Commit:
```
git add app/hub/agente/page.tsx
git commit -m "feat(agente): pagina server /hub/agente con gate admin e calcolo statoAgente"
```

---

### Task D5 — `AgenteClient`: scheletro + Card Pianificazione + Card Stato

Client component con stato locale della config, salvataggio via `PUT /api/admin/agente/config`, e le prime due card. Usa SOLO le variabili CSS `--brand-*` (come `LiveClient`). Le card Storico e Colonne arrivano in D6.

**Files**
- `components/modules/agente/AgenteClient.tsx` (nuovo)

**Step**
- [ ] Crea `components/modules/agente/AgenteClient.tsx` con codice reale:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RegolaMappa } from '@/lib/agente/decisione';
import { GIORNI_LABEL, formattaContatto, type AgenteConfigRow, type AgenteRunRow, type AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { StoricoCard } from './StoricoCard';
import { ColonneCard } from './ColonneCard';

export type AgenteClientProps = {
  config: AgenteConfigRow;
  runs: AgenteRunRow[];
  files: AgenteFileColonneRow[];
  stato: { online: boolean; allerta: string | null };
  minutiDaContatto: number | null;
};

/** Forma modificabile della config nel form (sottoinsieme salvabile). */
export type ConfigForm = {
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
};

const cardStyle = {
  borderColor: 'var(--brand-border)',
  backgroundColor: 'var(--brand-surface)',
} as const;

export default function AgenteClient({ config, runs, files, stato, minutiDaContatto }: AgenteClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<ConfigForm>({
    enabled: config.enabled,
    giorni: [...config.giorni].sort((a, b) => a - b),
    ora: config.ora,
    dry_run: config.dry_run,
    finestra_giorni: config.finestra_giorni,
    mappatura: config.mappatura,
    esito_positivo: config.esito_positivo,
    esito_negativo: config.esito_negativo,
  });
  const [salvando, setSalvando] = useState(false);
  const [esitoSalva, setEsitoSalva] = useState<{ ok: boolean; msg: string } | null>(null);

  function patch(p: Partial<ConfigForm>) {
    setForm((prev) => ({ ...prev, ...p }));
    setEsitoSalva(null);
  }

  function toggleGiorno(iso: number) {
    setForm((prev) => {
      const has = prev.giorni.includes(iso);
      const giorni = (has ? prev.giorni.filter((g) => g !== iso) : [...prev.giorni, iso]).sort((a, b) => a - b);
      return { ...prev, giorni };
    });
    setEsitoSalva(null);
  }

  async function salva() {
    setSalvando(true);
    setEsitoSalva(null);
    try {
      const res = await fetch('/api/admin/agente/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = (await res.json().catch(() => ({}))) as { errore?: string; error?: string };
      if (res.ok) {
        setEsitoSalva({ ok: true, msg: 'Impostazioni salvate.' });
        router.refresh();
      } else {
        setEsitoSalva({ ok: false, msg: j.errore ?? j.error ?? `Errore ${res.status}.` });
      }
    } catch {
      setEsitoSalva({ ok: false, msg: 'Errore di rete nel salvataggio.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Agente
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Pianificazione e feedback del sync limitazioni massive.
        </p>
      </header>

      {/* Card Pianificazione */}
      <section className="rounded-2xl border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Pianificazione</h2>
          <button
            type="button"
            onClick={() => patch({ enabled: !form.enabled })}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold transition"
            style={{
              backgroundColor: form.enabled ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
              color: form.enabled ? 'var(--success)' : 'var(--brand-text-muted)',
            }}
            aria-pressed={form.enabled}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: form.enabled ? '#22c55e' : '#9ca3af' }} />
            {form.enabled ? 'Acceso' : 'Spento'}
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Giorni</label>
          <div className="flex flex-wrap gap-1.5">
            {GIORNI_LABEL.map((lbl, i) => {
              const iso = i + 1; // 1=Lun..7=Dom
              const on = form.giorni.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleGiorno(iso)}
                  className="rounded-xl border px-3 py-1.5 text-sm font-medium transition"
                  style={{
                    borderColor: on ? 'var(--brand-primary)' : 'var(--brand-border)',
                    backgroundColor: on ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                    color: 'var(--brand-text-main)',
                  }}
                  aria-pressed={on}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Ora</label>
            <input
              type="time"
              value={form.ora}
              onChange={(e) => patch({ ora: e.target.value })}
              className="rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Finestra (giorni)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={form.finestra_giorni}
              onChange={(e) => patch({ finestra_giorni: Number(e.target.value) })}
              className="w-24 rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Modalità</label>
            <button
              type="button"
              onClick={() => patch({ dry_run: !form.dry_run })}
              className="rounded-xl border px-3 py-1.5 text-sm font-medium transition"
              style={{
                borderColor: 'var(--brand-border)',
                backgroundColor: form.dry_run ? 'var(--warning-soft)' : 'var(--brand-surface)',
                color: 'var(--brand-text-main)',
              }}
              aria-pressed={form.dry_run}
              title="Prova non scrive sui file; Reale scrive"
            >
              {form.dry_run ? 'Prova (dry-run)' : 'Reale'}
            </button>
          </div>
        </div>
      </section>

      {/* Card Stato */}
      <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Stato</h2>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stato.online ? '#22c55e' : '#9ca3af' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
            {stato.online ? 'Online' : 'Offline'}
          </span>
          <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            · ultimo contatto {formattaContatto(minutiDaContatto)}
          </span>
        </div>
        {stato.allerta && (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            role="alert"
          >
            ⚠ {stato.allerta}
          </div>
        )}
      </section>

      {/* Card Storico (D6) */}
      <StoricoCard runs={runs} />

      {/* Card Colonne & scrittura (D6) — l'editor mappa condivide form + salva */}
      <ColonneCard
        files={files}
        mappatura={form.mappatura}
        esitoPositivo={form.esito_positivo}
        esitoNegativo={form.esito_negativo}
        onChange={patch}
      />

      {/* Barra di salvataggio condivisa (Pianificazione + Colonne) */}
      <div className="sticky bottom-3 flex items-center justify-end gap-3">
        {esitoSalva && (
          <span
            className="rounded-full px-3 py-1 text-sm font-medium"
            style={{
              backgroundColor: esitoSalva.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: esitoSalva.ok ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {esitoSalva.msg}
          </span>
        )}
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvando}
          className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand-primary)] disabled:opacity-60"
          style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
        >
          {salvando ? 'Salvo…' : 'Salva impostazioni'}
        </button>
      </div>
    </main>
  );
}
```
- [ ] Verifica lint (gli import di `StoricoCard`/`ColonneCard` falliranno finché D6 non li crea — è atteso, NON crearli vuoti qui):
```
npx eslint components/modules/agente/AgenteClient.tsx
```
Atteso ORA: errori solo su `./StoricoCard` e `./ColonneCard` non risolti. Riconferma DOPO D6.
- [ ] Commit (insieme a D6 in chiusura, oppure subito se preferisci commit granulari):
```
git add components/modules/agente/AgenteClient.tsx
git commit -m "feat(agente): AgenteClient con card Pianificazione e Stato"
```

---

### Task D6 — Card Storico + Card Colonne & scrittura (con NUOVE/SPARITE e editor mappa)

Due componenti figli di `AgenteClient`. `StoricoCard` elenca gli `agente_run` con badge Prova/Reale, conteggi e dettaglio espandibile dal jsonb. `ColonneCard` mostra le colonne rilevate per file (NUOVE in verde, SPARITE barrate in rosso dai dati `agente_file_colonne`) e l'editor della mappa: per ogni campo `RegolaMappa` un toggle on/off + un `<select>` popolato coi nomi colonna rilevati + i 2 testi esito. Le modifiche risalgono ad `AgenteClient` via `onChange` e si salvano con la barra condivisa.

**Files**
- `components/modules/agente/StoricoCard.tsx` (nuovo)
- `components/modules/agente/ColonneCard.tsx` (nuovo)
- `components/modules/agente/__tests__/colonneView.test.ts` (nuovo)
- `lib/agente/colonneView.ts` (nuovo — helper PURI per le card)

**Step**
- [ ] Scrivi il test `components/modules/agente/__tests__/colonneView.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { colonneRilevate, uniscoMappaturaColonna, columnsDaFile } from '@/lib/agente/colonneView';

describe('colonneView', () => {
  it('columnsDaFile: unione ordinata di colonne attuali + sparite (dedup)', () => {
    const out = columnsDaFile({
      file: 'A.xlsx', is_master: true,
      colonne: ['esito', 'sigillo'], colonne_nuove: ['sigillo'], colonne_sparite: ['vecchia'],
      rilevato_il: '2026-06-16T00:00:00Z',
    });
    expect(out).toEqual([
      { nome: 'esito', stato: 'presente' },
      { nome: 'sigillo', stato: 'nuova' },
      { nome: 'vecchia', stato: 'sparita' },
    ]);
  });

  it('colonneRilevate: set globale ordinato e deduplicato dai file', () => {
    const out = colonneRilevate([
      { file: 'A', is_master: true, colonne: ['esito', 'sigillo'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
      { file: 'B', is_master: true, colonne: ['esito', 'comune'], colonne_nuove: [], colonne_sparite: [], rilevato_il: '' },
    ]);
    expect(out).toEqual(['comune', 'esito', 'sigillo']);
  });

  it('uniscoMappaturaColonna: aggiorna la regola del campo dato', () => {
    const reg = [
      { campo: 'esito', colonna: 'esito', abilitato: true },
      { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
    ];
    const out = uniscoMappaturaColonna(reg, 'esito', { colonna: 'ESITO LAVORO' });
    expect(out[0]).toEqual({ campo: 'esito', colonna: 'ESITO LAVORO', abilitato: true });
    expect(out[1]).toBe(reg[1]); // invariato per riferimento
  });

  it('uniscoMappaturaColonna: aggiorna abilitato', () => {
    const reg = [{ campo: 'esito', colonna: 'esito', abilitato: true }];
    const out = uniscoMappaturaColonna(reg, 'esito', { abilitato: false });
    expect(out[0].abilitato).toBe(false);
  });
});
```
- [ ] Verifica che il test FALLISCA:
```
npx vitest run components/modules/agente/__tests__/colonneView.test.ts
```
Atteso: rosso (`Cannot find module '@/lib/agente/colonneView'`).
- [ ] Crea `lib/agente/colonneView.ts` con codice reale:
```ts
import type { RegolaMappa } from '@/lib/agente/decisione';
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';

export type ColonnaStato = 'presente' | 'nuova' | 'sparita';
export type ColonnaVista = { nome: string; stato: ColonnaStato };

/** Colonne di un file con stato (nuova/presente/sparita) per l'evidenziazione. */
export function columnsDaFile(row: AgenteFileColonneRow): ColonnaVista[] {
  const nuove = new Set(row.colonne_nuove);
  const presenti: ColonnaVista[] = row.colonne.map((nome) => ({
    nome,
    stato: nuove.has(nome) ? 'nuova' : 'presente',
  }));
  const sparite: ColonnaVista[] = row.colonne_sparite
    .filter((nome) => !row.colonne.includes(nome))
    .map((nome) => ({ nome, stato: 'sparita' }));
  return [...presenti, ...sparite];
}

/** Insieme globale ordinato (asc) e deduplicato di tutte le colonne attualmente rilevate. */
export function colonneRilevate(files: AgenteFileColonneRow[]): string[] {
  const set = new Set<string>();
  for (const f of files) for (const c of f.colonne) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Aggiorna immutabilmente la regola del `campo` indicato (lascia le altre per riferimento). */
export function uniscoMappaturaColonna(
  mappatura: RegolaMappa[],
  campo: string,
  patch: Partial<RegolaMappa>,
): RegolaMappa[] {
  return mappatura.map((r) => (r.campo === campo ? { ...r, ...patch } : r));
}
```
- [ ] Verifica che il test PASSI:
```
npx vitest run components/modules/agente/__tests__/colonneView.test.ts
```
Atteso: `4 passed`.
- [ ] Crea `components/modules/agente/StoricoCard.tsx` con codice reale:
```tsx
'use client';

import { useState } from 'react';
import { badgeModalita, formattaIstante, type AgenteRunRow } from '@/lib/agente/uiTypes';

const cardStyle = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

function Conteggio({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
      <strong style={{ color: 'var(--brand-text-main)' }}>{value}</strong> {label}
    </span>
  );
}

export function StoricoCard({ runs }: { runs: AgenteRunRow[] }) {
  const [aperto, setAperto] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Storico giri</h2>
      {runs.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun giro registrato.</p>
      )}
      <ul className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
        {runs.map((run) => {
          const badge = badgeModalita(run.dry_run);
          const open = aperto === run.id;
          return (
            <li key={run.id} className="py-3">
              <button
                type="button"
                onClick={() => setAperto(open ? null : run.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                aria-expanded={open}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                    {formattaIstante(run.creato_il)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: badge.tono === 'prova' ? 'var(--warning-soft)' : 'var(--brand-primary-soft)',
                      color: badge.tono === 'prova' ? 'var(--brand-text-main)' : 'var(--brand-text-main)',
                    }}
                  >
                    {badge.label}
                  </span>
                  {run.errore && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>Errore</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <Conteggio label="lavori" value={run.lavori} />
                  <Conteggio label="aggiornate" value={run.aggiornate} />
                  <Conteggio label="extra" value={run.extra} />
                  <Conteggio label="conflitti" value={run.conflitti} />
                  <Conteggio label="non collocate" value={run.non_collocate} />
                </span>
              </button>
              {open && (
                <div className="mt-2 rounded-xl border p-3 text-xs"
                  style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface-muted)' }}>
                  {run.errore && (
                    <p className="mb-2 font-medium" style={{ color: 'var(--danger)' }}>{run.errore}</p>
                  )}
                  <pre className="overflow-auto whitespace-pre-wrap break-words" style={{ color: 'var(--brand-text-muted)' }}>
                    {JSON.stringify(run.dettaglio ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```
- [ ] Crea `components/modules/agente/ColonneCard.tsx` con codice reale:
```tsx
'use client';

import type { RegolaMappa } from '@/lib/agente/decisione';
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { columnsDaFile, colonneRilevate, uniscoMappaturaColonna } from '@/lib/agente/colonneView';
import { formattaIstante } from '@/lib/agente/uiTypes';

const cardStyle = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

const ETICHETTA_CAMPO: Record<string, string> = {
  esecutore: 'Esecutore',
  data: 'Data',
  esito: 'Esito',
  sigillo: 'Sigillo',
  matricola: 'Matricola',
  via: 'Via',
  pdr: 'PDR',
  nominativo: 'Nominativo',
  comune: 'Comune',
  marcatore: 'Marcatore (solo extra)',
};

export function ColonneCard({
  files,
  mappatura,
  esitoPositivo,
  esitoNegativo,
  onChange,
}: {
  files: AgenteFileColonneRow[];
  mappatura: RegolaMappa[];
  esitoPositivo: string;
  esitoNegativo: string;
  onChange: (p: { mappatura?: RegolaMappa[]; esito_positivo?: string; esito_negativo?: string }) => void;
}) {
  const opzioni = colonneRilevate(files);

  function setColonna(campo: string, colonna: string) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { colonna }) });
  }
  function setAbilitato(campo: string, abilitato: boolean) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { abilitato }) });
  }

  return (
    <section className="rounded-2xl border p-5 space-y-5" style={cardStyle}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Colonne & scrittura</h2>

      {/* Colonne rilevate per file */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Colonne rilevate</h3>
        {files.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna scansione ricevuta dall'agente.</p>
        )}
        {files.map((f) => (
          <div key={f.file} className="rounded-xl border p-3" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>{f.file}</span>
              {f.is_master && (
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}>master</span>
              )}
              <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>· {formattaIstante(f.rilevato_il)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columnsDaFile(f).map((c) => (
                <span
                  key={`${f.file}:${c.nome}`}
                  className="rounded-lg border px-2 py-0.5 text-xs"
                  style={
                    c.stato === 'nuova'
                      ? { borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }
                      : c.stato === 'sparita'
                        ? { borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', textDecoration: 'line-through' }
                        : { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-muted)' }
                  }
                  title={c.stato === 'nuova' ? 'Colonna nuova' : c.stato === 'sparita' ? 'Colonna sparita' : undefined}
                >
                  {c.nome}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Editor mappa */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Mappa di scrittura</h3>
        <div className="space-y-2">
          {mappatura.map((r) => (
            <div key={r.campo} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
              style={{ borderColor: 'var(--brand-border)' }}>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--brand-text-main)' }}>
                <input type="checkbox" checked={r.abilitato} onChange={(e) => setAbilitato(r.campo, e.target.checked)} />
                <span className="w-40 font-medium">{ETICHETTA_CAMPO[r.campo] ?? r.campo}</span>
              </label>
              <select
                value={r.colonna}
                onChange={(e) => setColonna(r.campo, e.target.value)}
                disabled={r.auto === true}
                className="min-w-[12rem] rounded-xl border px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
              >
                <option value="">{r.auto ? '(auto)' : '— scegli colonna —'}</option>
                {!opzioni.includes(r.colonna) && r.colonna !== '' && (
                  <option value={r.colonna}>{r.colonna} (non rilevata)</option>
                )}
                {opzioni.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {r.auto && (
                <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>colonna libera auto-rilevata</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Testi esito */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Testo esito positivo</label>
          <input
            type="text"
            value={esitoPositivo}
            onChange={(e) => onChange({ esito_positivo: e.target.value })}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Testo esito negativo</label>
          <input
            type="text"
            value={esitoNegativo}
            onChange={(e) => onChange({ esito_negativo: e.target.value })}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
        </div>
      </div>
    </section>
  );
}
```
- [ ] Verifica lint dei tre componenti + helper:
```
npx eslint components/modules/agente/AgenteClient.tsx components/modules/agente/StoricoCard.tsx components/modules/agente/ColonneCard.tsx lib/agente/colonneView.ts
```
Atteso: nessun errore (residui solo se `lib/agente/decisione` di Part A non è ancora sul branch — si chiude al merge).
- [ ] Verifica che la suite della cartella agente passi:
```
npx vitest run components/modules/agente lib/agente
```
Atteso: tutti i file della cartella verdi (`uiTypes`, `colonneView`).
- [ ] Commit:
```
git add components/modules/agente lib/agente/colonneView.ts
git commit -m "feat(agente): card Storico + Colonne&scrittura con NUOVE/SPARITE ed editor mappa"
```

---

### Task D7 — Verifica integrata del modulo UI

Chiusura: conferma che, con Part A/B presenti sul branch, l'intero modulo UI compila e i test mirati passano. Nessuna nuova feature.

**Files**
- (nessuna modifica; solo verifica)

**Step**
- [ ] Esegui i test mirati della Part D tutti insieme:
```
npx vitest run lib/__tests__/moduleAccess.agente.test.ts components/layout/__tests__/moduleIcons.agente.test.tsx lib/agente/__tests__/uiTypes.test.ts components/modules/agente/__tests__/colonneView.test.ts
```
Atteso: tutti verdi.
- [ ] Esegui lint mirato su tutti i file toccati dalla Part D:
```
npx eslint lib/moduleAccess.ts components/layout/moduleIcons.tsx app/hub/agente/page.tsx components/modules/agente/AgenteClient.tsx components/modules/agente/StoricoCard.tsx components/modules/agente/ColonneCard.tsx lib/agente/uiTypes.ts lib/agente/colonneView.ts
```
Atteso: nessun NUOVO errore (baseline repo già rossa altrove, non sistemarla qui).
- [ ] Conferma assenza di NUOVI errori di tipo introdotti dalla Part D:
```
npx tsc --noEmit
```
Atteso: nessun errore che citi `agente`, `moduleIcons`, `moduleAccess`, `AgenteClient`, `ColonneCard`, `StoricoCard`. Se compaiono `Cannot find module '@/lib/agente/decisione'` o `'@/lib/agente/orarioRoma'`, significa che Part A non è ancora sul branch: rieseguire DOPO il merge di Part A, non aggirare con stub.
- [ ] Smoke manuale (sul deploy o `npm run dev`): da admin aprire `/hub/agente` → le 4 card si vedono; toggle Acceso/Spento, selezione giorni, ora, finestra, Prova/Reale; editor mappa popola i `<select>` coi nomi colonna; "Salva impostazioni" mostra "Impostazioni salvate."; da operatore `/hub/agente` redirige a `/hub`.
- [ ] Commit (se restano modifiche non committate):
```
git add -A
git commit -m "chore(agente): verifica integrata modulo UI (lint/test mirati verdi)"
```

---

**Note di integrazione Part D**
- `app/hub/agente/page.tsx` e `AgenteClient` consumano da Part A/B: `statoAgente`, `RegolaMappa` (`lib/agente/decisione.ts`) e `partiRoma` (`lib/agente/orarioRoma.ts`). La firma usata è quella dei CONTRATTI: `statoAgente({ minutiDaContatto, enabled, giorni, ora, oraCorrente, weekday, ultimoGiroOggi, onlineMin?, graziaMin? }) -> { online, allerta }`; la pagina calcola `minutiDaContatto` da `ultimo_contatto_il` e `ultimoGiroOggi` confrontando `ultimo_giro_il.slice(0,10)` con `oggi` (Rome).
- Il salvataggio chiama `PUT /api/admin/agente/config` (Part C) con body `{ enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo }`, esattamente i campi che `validaConfig` accetta. Il client legge `errore` dalla risposta d'errore.
- Tutti i colori usano variabili `--brand-*` / `--success*` / `--danger*` / `--warning-soft` già in uso in `LiveClient` (nessun colore hard-coded salvo i pallini di stato `#22c55e`/`#9ca3af`, coerenti con `LiveClient`).

---

## Self-Review (Piano B)
- Card Pianificazione/Stato/Storico/Colonne&scrittura coprono §5 + §1b. ✅
- Il menu colonne usa i nomi reali da `agente_file_colonne`; nuove/sparite evidenziate. ✅
- Permesso `agente` admin-only (requiresAdminRole). ✅
