# Risanamento colonne — Fase 2: Editor template

**Data:** 2026-06-09
**Stato:** Design in revisione
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 2**.

---

## Contesto

La Fase 1 ha posato lo schema (tabella riferimento, `rapportino_righe`, flag `tipo` su template/rapportini)
e l'import dell'estrazione. La Fase 2 rende l'editor template capace di:
1. impostare il **tipo** del template (`standard` / `risanamento`);
2. per i template risanamento, dare a ogni **campo foto** uno **scope** (Misuratore / Fase / Accessoria),
   così le foto si organizzano nelle 3 sezioni previste dal flusso operativo.

Decisioni dal brainstorming:
- **Slot liberi con scope**: ogni campo foto = etichetta + scope + obbligatorio. L'admin aggiunge quanti
  slot vuole per ogni scope (es. 2 Misuratore "Prima"/"Dopo"; N Fasi resina; le Accessorie opzionali).
- **Accessoria = sempre opzionale-attivabile**: per scope=accessoria il flag "obbligatoria" non si applica
  (l'operatore la attiva on-demand in Fase 4).

---

## Sezione 1 — Modello + schema

- `TemplateCampo` (in `utils/rapportini/buildVoci.ts`) guadagna:
  ```ts
  scope_foto?: 'misuratore' | 'fase' | 'accessoria'; // solo per tipo='foto' nei template risanamento
  ```
  Vive già nel jsonb `campi` del template → si persiste senza modifiche all'API per i `campi`.
- `CampoSchema` (in `lib/rapportini/templateSchema.ts`) guadagna il campo opzionale:
  ```ts
  scope_foto: z.enum(['misuratore', 'fase', 'accessoria']).optional(),
  ```
- `TemplateSchema` guadagna il campo `tipo`:
  ```ts
  tipo: z.enum(['standard', 'risanamento']).optional().default('standard'),
  ```
- L'API admin template (`app/api/admin/rapportino-template/route.ts`): GET espone `tipo`; POST/PATCH
  persistono `tipo` (la colonna esiste dalla Fase 1). I `campi` (con `scope_foto` dentro) sono già
  persistiti come jsonb.

## Sezione 2 — Editor UI (`TemplateRapportiniClient.tsx`)

- **Selettore "Tipo template"** (Standard / Risanamento) in cima all'editor (vicino a Nome/Committente).
  Stato `tipo` integrato in `loadTemplate`/`startNew`/`handleSave`/auto-save (stessa pipeline di
  `committente`/`soloManuale`).
- Quando **tipo='risanamento'**, ogni riga-campo di `tipo='foto'` mostra un selettore **scope**:
  *Misuratore (prima/dopo)* · *Fase lavorazione* · *Accessoria opzionale*. Default per un nuovo campo
  foto in template risanamento: `scope_foto='misuratore'`.
- **Accessoria opzionale**: quando `scope_foto='accessoria'`, il flag "Foto obbligatoria" è nascosto e
  `obbligatoria` viene forzato a `false` (le accessorie sono sempre attivabili on-demand).
- Quando **tipo='standard'**, l'editor resta identico a oggi (nessun selettore scope; `scope_foto` non
  viene mostrato né impostato).
- **Anteprima scope**: sotto la lista campi, una piccola anteprima testuale che raggruppa i campi foto per
  scope (Misuratori / Fasi / Accessorie) con accanto "obbligatoria/opzionale", così l'admin vede come si
  organizzeranno le 3 sezioni operative. (L'anteprima ricca con il rendering reale arriva in Fase 4.)

## Data flow

```
Admin apre il template → sceglie Tipo = Risanamento
   → per ogni campo foto sceglie scope (misuratore/fase/accessoria) + obbligatoria
   → auto-save: PATCH { tipo, campi:[{...,scope_foto}] }
   → DB: rapportino_template.tipo + campi (jsonb con scope_foto)
La Fase 4 leggera' campi+scope per rendere le 3 sezioni; la Fase 5 usera' gli obbligatori Misuratore
per il vincolo di chiusura.
```

## Error handling

- `scope_foto` su un campo non-foto → ignorato (rilevante solo per tipo='foto'); lo schema lo ammette opzionale ma l'editor lo espone solo sui campi foto.
- Template `standard` con campi che avessero `scope_foto` residuo → innocuo (non usato dal rendering standard).
- Cambio di un campo da `foto` ad altro tipo → `scope_foto` resta nel dato ma è ignorato; opzionale ripulirlo (YAGNI: non necessario).

## Testing

- Unit (schema): `CampoSchema` accetta `scope_foto` valido e rifiuta valori fuori enum; `TemplateSchema` accetta `tipo`.
- Unit (helper editor, se introdotto): la logica "accessoria ⇒ obbligatoria=false" isolata e testata.
- Editor/endpoint: verifica via `tsc`/`eslint`/`build` (il progetto non testa le route/UI in E2E).

## Fuori scope (YAGNI / fasi successive)

- Nessun rendering operativo delle 3 sezioni né scanner (Fase 4).
- Nessun vincolo di chiusura "doppia foto per riga" (Fase 5; il modello scope+obbligatoria lo abilita).
- Nessuna generazione link/assegnazione (Fase 3).
- Nessuna modifica al flusso dei template `standard` esistenti.
