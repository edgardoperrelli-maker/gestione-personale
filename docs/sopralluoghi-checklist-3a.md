# ✅ Checklist Verifica Collegamenti Modulo Sopralluoghi

Dopo aver eseguito **PROMPT 3A**, verifica che il modulo sia visibile ovunque.

## 🎯 Cosa viene aggiornato automaticamente

Con le modifiche in PROMPT 3A:

1. `lib/moduleAccess.ts` → aggiungi `sopralluoghi` a `AppModuleKey` + `APP_MODULES`
2. `app/hub/page.tsx` → aggiungi `sopralluoghi` a `moduleCards`

Risultato:
- ✅ **Hub grid** (`/hub`) → Card "Sopralluoghi" appare automaticamente
- ✅ **TopNav dropdown** (menu "Moduli") → Link "Sopralluoghi" appare automaticamente
- ✅ **Breadcrumb/routing** → Funziona per `/hub/sopralluoghi/*`

## 📋 Test Rapido

### 1. Verifica Hub Grid

```bash
# Apri http://localhost:3000/hub
# Dovresti vedere:
```

**Grid con 6 card (o 7 se admin):**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Cronoprogramma│ │Calendario    │ │SmarTracker   │
│Core          │ │Hotel         │ │              │
└──────────────┘ └──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Rapportini    │ │Mappa         │ │Sopralluoghi  │ ← NUOVO
│              │ │Operatori     │ │Nuovo         │
│              │ │Nuovo         │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

Card "Sopralluoghi":
- ✅ Badge "Nuovo" (blu)
- ✅ Icona clipboard
- ✅ Descrizione "Gestione sopralluoghi territorio"
- ✅ Link "Apri →"

### 2. Verifica TopNav Dropdown

```bash
# In qualsiasi pagina dell'app
# Click su "Moduli" in alto
```

**Dropdown aperto:**
```
┌────────────────────┐
│ Cronoprogramma     │
│ Calendario Hotel   │
│ SmarTracker        │
│ Rapportini         │
│ Mappa Operatori    │
│ Sopralluoghi       │ ← NUOVO
├────────────────────┤
│ Impostazioni       │
│ Account            │
└────────────────────┘
```

### 3. Verifica Link Attivo

```bash
# Vai a /hub/sopralluoghi (404 per ora, normale)
# Apri dropdown "Moduli"
```

Link "Sopralluoghi" dovrebbe essere:
- ✅ In grassetto (`font-semibold`)
- ✅ Colore rosso Plenzich (`var(--brand-primary)`)
- ✅ Indica che sei nella sezione

### 4. Verifica Permessi

**Come admin:**
- ✅ Vede "Sopralluoghi" in Hub
- ✅ Vede "Sopralluoghi" in dropdown
- ✅ Può cliccare (anche se porta a 404 fino a PROMPT 3B)

**Come operatore:**
- ✅ Vede "Sopralluoghi" in Hub (modulo non ha `adminOnly: true`)
- ✅ Vede "Sopralluoghi" in dropdown

## 🐛 Troubleshooting

### Card non appare nel Hub

**Causa 1:** Server non riavviato

```bash
# Ctrl+C per fermare
npm run dev
# Hard refresh browser (Ctrl+Shift+R)
```

**Causa 2:** TypeScript error

```bash
# Verifica errori
npm run type-check

# Se errore su AppModuleKey:
# Assicurati di aver aggiunto 'sopralluoghi' al type union
```

**Causa 3:** moduleCards mancante

```bash
# Verifica che in app/hub/page.tsx ci sia:
grep -A 10 "sopralluoghi:" app/hub/page.tsx
```

### Link non appare nel dropdown

**Causa:** Cache app metadata utente — Logout + Login

Se ancora non appare:

```sql
-- Verifica app_metadata in Supabase SQL Editor
SELECT 
  email,
  raw_app_meta_data->>'allowedModules' as modules
FROM auth.users
WHERE email = 'tua-email@test.com';

-- Se 'sopralluoghi' manca dall'array, aggiorna:
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  raw_app_meta_data,
  '{allowedModules}',
  (
    SELECT jsonb_agg(DISTINCT elem)
    FROM jsonb_array_elements_text(
      COALESCE(raw_app_meta_data->'allowedModules', '[]'::jsonb)
    ) elem
    UNION
    SELECT 'sopralluoghi'::text
  )
)
WHERE email = 'tua-email@test.com';
```

### Click su card → errore

```bash
# NORMALE fino a PROMPT 3B
# 404 "This page could not be found" è OK
# Dopo PROMPT 3B dovrebbe mostrare la pagina
```

## ✨ Riepilogo

**PROMPT 3A modifica solo 2 file:**

1. `lib/moduleAccess.ts` (2 modifiche)
   - Aggiungi `'sopralluoghi'` al type
   - Aggiungi oggetto in `APP_MODULES`

2. `app/hub/page.tsx` (1 modifica)
   - Aggiungi `sopralluoghi: {...}` in `moduleCards`

**Tutto il resto si auto-sincronizza:**
- `lib/appNavigation.ts` → legge da `APP_MODULES` (nessuna modifica necessaria)
- `components/layout/TopNav.tsx` → legge da `appNavigation` (nessuna modifica necessaria)

---

**Prossimo step:** PROMPT 3B per creare le pagine effettive
