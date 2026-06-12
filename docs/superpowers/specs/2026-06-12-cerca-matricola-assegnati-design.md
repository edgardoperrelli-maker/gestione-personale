# Cerca matricola "smart" — assegnati / conflitti / suggerimenti (Lim massive)

**Data:** 2026-06-12
**Stato:** Design in revisione

## Contesto
Nella modale "Limitazioni massive" lo step **"Cerca matricola"** oggi cerca solo nei **censiti** (`limitazione_misuratori_ref`) e, se non trova, permette inserimento manuale. Problema reale: spesso quella matricola è **già un task pianificato** all'operatore (le voci del suo rapportino, es. le 25 "LIMITAZIONE MASSIVA"), quindi creare un nuovo intervento manuale è un **doppione**. Inoltre può essere pianificata a **un altro operatore** dello stesso piano.

Per le limitazioni i task sono **voci pianificate** del rapportino (`rapportino_voci`, ognuna con `.matricola`). Gli operatori dello stesso piano condividono `rapportini.piano_id`.

## Decisioni (confermate)
1. **Già tuo → apertura automatica** della voce (VoceFocus), con avviso "ordine già assegnato a te". Niente nuovo intervento.
2. **Di un altro operatore → alert** (non bloccante): "Matricola assegnata a [Nome] — verifica prima di procedere".
3. **Suggerimenti "simili" anche dai task del proprio rapportino** (oltre ai censiti).
4. **Scope conflitto = stesso piano/campagna** (`rapportini.piano_id`, staff diverso).

## Flusso (al "cerca", da scan o digitazione di `q`)
1. **Match esatto tra i propri task** (client): `voci.find(v => normMatricola(v.matricola) === normMatricola(q))`.
   - Trovato → `onApriAssegnato(voce.id)` → la modale si chiude, `RapportinoForm` **apre la voce** (VoceFocus) con `window.alert('Ordine già assegnato a te — apro il task da compilare.')`. **Fine.**
2. **Altrimenti** → `GET /api/r/[token]/cerca-limitazione?q=…` (esteso, vedi §2). La risposta include `altroOperatore`.
   - Se `altroOperatore` ≠ null → mostra **banner alert** "⚠️ Matricola assegnata a {altroOperatore} — verifica prima di procedere" e **non avanza** in automatico: l'operatore prosegue con un'azione esplicita (scegliere un suggerimento, "Procedi comunque", o inserimento manuale).
   - Se `trovato` (censito esatto) e nessun `altroOperatore` → autofill come ora.
   - Altrimenti → **suggerimenti** (vedi §3).

## 1. Cosa è già lato client
`RapportinoForm` ha `voci` (i task assegnati, con `.matricola`) e `onApri(index)` → VoceFocus. Passo a `ModaleInterventoManuale` → `CercaMatricolaLimitazione`:
- `voci: Array<{ id: string; matricola?: string; via?: string; comune?: string }>`
- `onApriAssegnato: (voceId: string) => void`

`RapportinoForm` implementa `onApriAssegnato`:
```ts
onApriAssegnato={(voceId) => {
  setModaleAperta(false);
  const idx = voci.findIndex((v) => v.id === voceId);
  if (idx >= 0) { window.alert('Ordine già assegnato a te — apro il task da compilare.'); onApri(idx); }
}}
```
Il match e i suggerimenti dai propri task usano `normMatricola` / `matricoleSimili` (riuso da `lib/limitazione/matricoleSimili.ts`).

## 2. Endpoint `cerca-limitazione` — esteso col conflitto altro-operatore
`app/api/r/[token]/cerca-limitazione/route.ts`:
- Estende la select del rapportino a `piano_id, staff_id` (oltre a id/stato/data/riaperto_at).
- **Dopo** il calcolo censiti (esatto/simili), calcola `altroOperatore`:
  1. `rapportini.select('id, staff_name').eq('piano_id', pianoId).neq('staff_id', staffId)` → altri operatori dello stesso piano (mappa `rapportino_id → staff_name`).
  2. Se ce ne sono: `rapportino_voci.select('matricola, rapportino_id').in('rapportino_id', [ids]).not('matricola','is',null).limit(2000)` → filtra in memoria `normMatricola(v.matricola) === normMatricola(q)` → primo `staff_name` corrispondente (o null).
- Risposta (in entrambi i rami): aggiunge `altroOperatore: string | null`.
  - `{ trovato: true, misuratore, altroOperatore }`
  - `{ trovato: false, suggerimenti, altroOperatore }`

Logica "altro operatore" in una **funzione pura** dove possibile (filtro voci per matricola normalizzata) → `lib/limitazione/matchVociMatricola.ts` (+test): `(voci, q) => primaVoceConMatricola | null`.

## 3. Suggerimenti — censiti + propri task
In `CercaMatricolaLimitazione`, quando non c'è match esatto:
- **suggerimenti censiti**: dal server (come ora), selezione → `onTrovato(misuratore)` (autofill).
- **suggerimenti dal rapportino**: client, `matricoleSimili(q, voci)` (riuso, generico su `{matricola}`), selezione → `onApriAssegnato(voce.id)`. Etichetta "📋 già nel tuo rapportino".
- I due gruppi mostrati con intestazioni distinte. Se entrambi vuoti → "Inserisci a mano".

## File toccati
- **Nuovi:** `lib/limitazione/matchVociMatricola.ts` (+`.test.ts`).
- **Modificati:**
  - `app/api/r/[token]/cerca-limitazione/route.ts` (select piano_id/staff_id + blocco altroOperatore).
  - `components/modules/rapportini/limitazione/CercaMatricolaLimitazione.tsx` (own-match auto-open, alert conflitto, suggerimenti dai task).
  - `components/modules/rapportini/ModaleInterventoManuale.tsx` (prop `voci` + `onApriAssegnato`, passate a Cerca).
  - `components/modules/rapportini/RapportinoForm.tsx` (passa `voci` + `onApriAssegnato` alla modale).

## Testing
- **Pure fn** `matchVociMatricola` → unit (vitest): match esatto normalizzato (incl. prefisso variabile), nessun match → null, ignora voci senza matricola.
- `matricoleSimili` già testata (riuso sui voci).
- Endpoint + UI (scanner/navigazione) → gate `tsc`/`eslint`; prova sul campo (deploy).

## Fuori scope
- Conflitto su scope diverso da "stesso piano" (estendibile a stessa giornata in futuro).
- Blocco rigido sul conflitto altro-operatore (scelto **alert non bloccante**).
- Estensione a Italgas/Acea (lo step "Cerca matricola" esiste solo per Lim massive).
