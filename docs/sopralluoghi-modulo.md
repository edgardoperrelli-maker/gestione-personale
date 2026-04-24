# 📋 Modulo Sopralluoghi - Risanamento Colonne Montanti Napoli

Sistema completo per gestione sopralluoghi su vasta scala (526 microaree, 126.885 civici).

## 🎯 Architettura Sistema

### Workflow
```
1. PIANIFICAZIONE
   ├─ Mappa interattiva satellite
   ├─ Selezione microarea
   └─ Genera PDF sopralluogo (stampabile)

2. SOPRALLUOGO CAMPO (OFFLINE)
   ├─ Assistente porta PDF cartaceo
   ├─ Segna civici visitati + idonei
   └─ Annotazioni manuali

3. DATA ENTRY (UFFICIO)
   ├─ Upload/riferimento PDF compilato
   ├─ Form digitale guidato
   └─ Salvataggio DB con upsert

4. EXPORT & ANALISI
   ├─ Export Excel civici programmati
   ├─ Statistiche microaree
   └─ Mappa avanzamento lavori
```

## 📦 Deliverable Pronti

### 1. Dataset Civici Napoli
- `napoli_civici_microaree.csv` — 126.885 civici georeferenziati
- `napoli_microaree_stats.csv` — 526 microaree con statistiche
- `mappa_microaree_napoli.png` — visualizzazione geografica

### 2. Script Generazione PDF
- `scripts/genera-pdf-sopralluogo.js` — PDF singolo per microarea
- `scripts/genera-tutti-pdf.js` — batch 526 PDF
- `scripts/package.json` — dipendenze Puppeteer

### 3. Prompt Claude Code (implementazione app)

**DATABASE**
- `PROMPT_1_DATABASE_SCHEMA.md` — Migration SQL completa
- `PROMPT_2_IMPORT_CSV.md` — Script import civici

**UI & INTEGRAZIONE**
- `PROMPT_3A_REGISTRA_MODULO.md` — Registra modulo in navigation
- `PROMPT_3B_STRUTTURA_PAGINE.md` — Layout + pagina principale
- `PROMPT_3C_MAPPA_INTERATTIVA.md` — Mappa Leaflet con overlay
- `PROMPT_3D_API_GENERA_PDF.md` — API endpoint generazione PDF
- `PROMPT_3E_DATA_ENTRY.md` — Form registrazione sopralluoghi
- `PROMPT_3F_EXPORT_EXCEL.md` — Export Excel civici programmati

## 🚀 Quick Start

### Fase 1: Setup Database (5 min)

```bash
# 1. Copia SQL da PROMPT_1 in Supabase SQL Editor
# Esegui migration → crea tabelle + RLS + viste

# 2. Verifica
SELECT COUNT(*) FROM civici_napoli;
-- Dovrebbe essere 0

# 3. Prepara CSV
mkdir -p public/data
cp napoli_civici_microaree.csv public/data/
```

### Fase 2: Import Civici (10 min)

```bash
# 1. Crea script import
# Copia codice da PROMPT_2 in scripts/import-civici-napoli.mjs

# 2. Esegui import
node scripts/import-civici-napoli.mjs

# Output atteso:
# ✅ 126885 civici importati
# ✅ 526 microaree popolate

# 3. Verifica
SELECT microarea, COUNT(*) 
FROM civici_napoli 
GROUP BY microarea 
ORDER BY microarea 
LIMIT 5;
```

### Fase 3: Integrazione UI (30 min con Claude Code)

**Esegui in ordine sequenziale:**

```bash
# 1. Registra modulo
# → PROMPT_3A in Claude Code (VS Code extension)
# Modifica: lib/moduleAccess.ts, app/hub/page.tsx

# 2. Crea pagine
# → PROMPT_3B
# Crea: app/hub/sopralluoghi/layout.tsx + page.tsx + risanamento/page.tsx

# 3. Mappa interattiva
# → PROMPT_3C
# Installa: npm install leaflet @types/leaflet
# Crea: RisanamentoClient.tsx + MappaRisanamento.tsx

# 4. API generazione PDF
# → PROMPT_3D
# Crea: app/api/sopralluoghi/genera-pdf/route.ts
# Copia: genera-pdf-sopralluogo.js in root progetto

# 5. Data entry
# → PROMPT_3E
# Crea: app/hub/sopralluoghi/data-entry/page.tsx + DataEntryClient.tsx

# 6. Export Excel
# → PROMPT_3F
# Installa: npm install exceljs
# Crea: app/api/sopralluoghi/export-excel/route.ts
```

### Fase 4: Test Sistema (15 min)

```bash
# 1. Avvia server
npm run dev

# 2. Login come admin → http://localhost:3000/hub

# 3. Verifica modulo "Sopralluoghi" presente nella grid

# 4. Test mappa
# → /hub/sopralluoghi/risanamento
# → Dovresti vedere mappa satellite con 526 rettangoli colorati

# 5. Test generazione PDF
# → Click su microarea → "Genera PDF"
# → Verifica file in public/pdf_sopralluoghi/MICROAREA_XXX_sopralluogo.pdf

# 6. Test data entry
# → /hub/sopralluoghi/data-entry
# → Seleziona PDF → spunta civici → salva

# 7. Test export
# → /hub/sopralluoghi/risanamento → "Export Excel"
# → Verifica download .xlsx
```

## 📊 Schema Database

```sql
-- 3 tabelle principali
civici_napoli              -- 126k civici da ANNCSU
sopralluoghi               -- registro sopralluoghi
sopralluoghi_pdf_generati  -- tracking PDF

-- 1 vista aggregata
microaree_stats            -- statistiche per microarea
```

## 🗺️ Struttura Microaree

```
526 microaree geografiche
├─ Griglia regolare ~500m × 500m
├─ ID: MICROAREA_001 ... MICROAREA_526
├─ Ordinamento: per densità (001 = più densa)
└─ Range civici: 1-2949 per microarea
```

## 🎨 Design System

**Colori Plenzich:**
- Primary: `#921B1B` (rosso)
- Sidebar: `#2C1010`
- Background soft: `rgba(146, 27, 27, 0.1)`

**Stati microarea (mappa):**
- 🔵 Blu = da visitare (0% visitati)
- 🟡 Giallo = parzialmente visitato (30-80%)
- 🟢 Verde = completato (>80% visitati)

## 📁 Struttura File Progetto

```
gestione-personale/
├── app/
│   └── hub/
│       └── sopralluoghi/
│           ├── layout.tsx
│           ├── page.tsx
│           ├── risanamento/
│           │   ├── page.tsx
│           │   ├── RisanamentoClient.tsx
│           │   └── MappaRisanamento.tsx
│           └── data-entry/
│               ├── page.tsx
│               └── DataEntryClient.tsx
├── app/api/
│   └── sopralluoghi/
│       ├── genera-pdf/route.ts
│       ├── lista-pdf/route.ts
│       └── export-excel/route.ts
├── public/
│   ├── data/
│   │   └── napoli_civici_microaree.csv
│   └── pdf_sopralluoghi/
│       └── MICROAREA_XXX_sopralluogo.pdf
├── scripts/
│   ├── import-civici-napoli.mjs
│   ├── genera-pdf-sopralluogo.js
│   └── package.json
├── supabase/migrations/
│   └── 20260424000000_sopralluoghi_schema.sql
└── docs/
    └── sopralluoghi-modulo.md  ← questo file
```

## 🔒 Permessi

**Admin:**
- Genera PDF
- Data entry
- Export Excel
- Modifica sopralluoghi

**Operatore:**
- Visualizza mappa (read-only)
- Consulta statistiche

## 📱 Responsive

- **Desktop**: mappa full-screen, sidebar filtri
- **Tablet**: mappa ridimensionabile, filtri collapsibili
- **Mobile**: solo visualizzazione statistiche (mappa Leaflet sconsigliata)

## 🐛 Troubleshooting

**PDF non si genera:**
```bash
# Verifica Puppeteer installato
cd scripts && npm list puppeteer

# Test script manuale
node scripts/genera-pdf-sopralluogo.js MICROAREA_001

# Verifica file creato
ls -la scripts/pdf_sopralluoghi/
```

**Mappa non carica:**
```bash
# Verifica Leaflet
npm list leaflet

# Controlla console browser per errori SSR
# Assicurati che MappaRisanamento sia in dynamic import
```

**Import CSV fallisce:**
```bash
# Verifica service role key in .env.local
echo $SUPABASE_SERVICE_ROLE_KEY

# Verifica formato CSV
head -5 public/data/napoli_civici_microaree.csv

# Test singolo batch
# Modifica script: const BATCH_SIZE = 10;
```

## 📈 KPI Sistema

**Obiettivi:**
- ✅ 526 microaree mappate
- ✅ 126.885 civici da visitare
- 🎯 Target 90% copertura sopralluoghi in 6 mesi
- 🎯 Export settimanale civici programmati per Plenzich

**Metriche dashboard:**
- Microaree completate / totali
- % civici visitati
- % civici idonei per risanamento
- Tempo medio sopralluogo per microarea

## 🔄 Roadmap Futuri Sviluppi

**V2 - Ottimizzazioni:**
- [ ] Route planning ottimizzato per assistente (TSP solver)
- [ ] App mobile offline per data entry campo
- [ ] OCR automatico da PDF scansionato
- [ ] Integrazione foto sopralluogo (storage Supabase)

**V3 - Analytics:**
- [ ] Dashboard BI con Metabase
- [ ] Heatmap densità idonei
- [ ] Previsione tempi completamento AI
- [ ] Export GeoJSON per GIS esterno

## 📞 Supporto

Per dubbi su implementazione:
1. Rileggi PROMPT corrispondente
2. Verifica esempi nel prompt
3. Controlla console/logs
4. Test con dati di esempio ridotti

---

**© 2026 GestiLab Cantieri - Plenzich S.p.A.**  
Sistema sviluppato per programma risanamento colonne montanti Napoli
