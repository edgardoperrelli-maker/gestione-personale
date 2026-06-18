# Storico interventi — foto in anteprima + modifica (admin_plus)

**Data:** 2026-06-18
**Stato:** design approvato
**Branch:** `feat/storico-modifica-foto`

## Obiettivo

Nella pagina **Storico interventi** (`/hub/interventi`, basata su `rapportino_voci`):

1. **Foto in anteprima**: ogni riga ha un pulsante **📷 Foto**. Le foto **non**
   vengono caricate a priori: solo al click si apre una modale che richiede e
   mostra le anteprime (signed URL) della voce. Disponibile a **tutti gli utenti
   abilitati al modulo** (lettura).
2. **Modifica (solo admin_plus)**: ogni riga ha un pulsante **✎ Modifica**
   visibile **solo agli admin_plus**. Apre una modale per correggere i campi
   della voce (anagrafica + risposte) e salvarli nel DB, così i **conflitti
   segnalati dall'agente limitazioni** vengono risolti alla fonte e non si
   ripresentano.

La pagina resta in **sola lettura** per gli utenti non admin_plus (vedono tabella
+ foto, niente ✎). Nessun gate admin_plus sulla pagina.

Fuori scope (YAGNI): niente modifica di esecutore/data del rapportino (sono a
livello rapportino, cross-voce); niente upload/eliminazione foto da qui (solo
visualizzazione); nessuna modifica all'editor rapportino admin esistente.

## Contesto / riuso

- **Modifica voce esistente**: `POST /api/admin/rapportini/voce`
  (`app/api/admin/rapportini/voce/route.ts`) salva `rapportino_voci.risposte` via
  `mergeRisposte(..., { soloCompletamentoFoto: false })`
  (`utils/rapportini/mergeRisposte.ts`) e **ripropaga** stato/esito agli
  `interventi` con `patchInterventoLiveDaVoce(merged, campi)`
  (`lib/interventi/esitoDaVoce.ts`). Auth `requireAdmin` (admin). NON tocca
  l'anagrafica. → riuso i due helper, ma con endpoint nuovo **admin_plus** che
  gestisce ANCHE l'anagrafica.
- **Foto**: bucket `interventi-foto`; path reali `rapportini/…` dentro
  `rapportino_voci.risposte` nei campi `tipo='foto'`. Helper `comeArrayFoto`
  (`utils/rapportini/comeArrayFoto.ts`), `contaFotoScaricabili`
  (`utils/rapportini/contaFotoScaricabili.ts`). Signed URL: pattern di
  `app/api/admin/interventi-manuali/[id]/foto/route.ts`
  (`supabaseAdmin.storage.from('interventi-foto').createSignedUrl(path, TTL)`).
- **admin_plus**: `resolveAssignableRole(profile?.role, user.app_metadata?.role) === 'admin_plus'`
  (`lib/moduleAccess.ts`); `canManageUsers` come gate; pattern `requireAdminPlus`
  locale in `app/api/admin/users/route.ts`. La pagina server passa `isAdminPlus`
  al client (pattern `app/impostazioni/hotel/page.tsx`).
- **Storico attuale**: `RigaStorico.id` = voceId; endpoint `caricaStorico.ts`,
  `StoricoTabella`, `StoricoInterventiClient`, page `app/hub/interventi/page.tsx`.

## Architettura

Tutti gli endpoint nuovi sono **keyed su `voceId`** e caricano il resto lato
server (rapportino, campi_snapshot). **`RigaStorico` resta invariato** (la riga
ha già `id`).

### Endpoint 1 — Foto anteprima (lettura, tutti gli abilitati)

`GET /api/admin/interventi/storico/voce/[voceId]/foto`
- Auth: `requireUser` (autenticato; la pagina è già gated dal permesso modulo).
- Carica `rapportino_voci` (`risposte`, `rapportino_id`) + `rapportini.campi_snapshot`.
- Determina i campi `tipo='foto'`; per ogni path `rapportini/…` (via `comeArrayFoto`,
  ignora `blob-locale:`) genera signed URL (`supabaseAdmin`, TTL 10 min).
- Risposta: `{ foto: [{ etichetta, fileName, url }] }` (lista eventualmente vuota).

### Endpoint 2 — Dati per la modale di modifica (admin_plus)

`GET /api/admin/interventi/storico/voce/[voceId]`
- Auth: `requireAdminPlus` (locale, `resolveAssignableRole === 'admin_plus'` → 403 altrimenti).
- Ritorna `{ anagrafica, risposte, campi }`:
  - `anagrafica`: `{ odl, via, comune, attivita, matricola, pdr, nominativo, cap, fascia_oraria }`
    (colonne di `rapportino_voci`).
  - `risposte`: `rapportino_voci.risposte` correnti.
  - `campi`: campi **non-foto** del template (`campi_snapshot`) con
    `{ chiave, etichetta, tipo, opzioni }` (per render input). Se nessun campo ha
    `chiave='note'`, il client aggiunge comunque un campo Note (textarea) mappato
    su `risposte.note`.

### Endpoint 3 — Salvataggio modifica (admin_plus)

`PATCH /api/admin/interventi/storico/voce/[voceId]`
- Auth: `requireAdminPlus`.
- Body: `{ anagrafica?: Partial<Anagrafica>, risposte?: Record<string, unknown> }`.
- Logica:
  1. Carica voce (`id, intervento_id, risposte`) + `rapportini.campi_snapshot`.
  2. `merged = mergeRisposte(voce.risposte ?? {}, body.risposte ?? {}, { soloCompletamentoFoto: false })`.
  3. UPDATE `rapportino_voci` SET le colonne anagrafiche presenti in `body.anagrafica`
     (solo whitelist: odl, via, comune, attivita, matricola, pdr, nominativo, cap, fascia_oraria)
     + `risposte = merged`.
  4. Se `intervento_id`: ripropaga con `patchInterventoLiveDaVoce(merged, campi)`
     (stato/esito/chiuso_at) **e** allinea le colonne anagrafiche dell'intervento
     (`odl`, `indirizzo`←via, `comune`, `intervento_tipo`←attivita,
     `matricola_contatore`←matricola, `pdr`, `nominativo`) per i valori presenti in
     `body.anagrafica` → così l'agente (che legge da `interventi`) vede il dato corretto.
  5. Risposta `{ ok: true }`.
- Validazione: voce inesistente → 404; body vuoto → 400.

### UI

- `app/hub/interventi/page.tsx` (server): calcola `isAdminPlus` e lo passa a
  `StoricoInterventiClient`.
- `StoricoInterventiClient`: prop `isAdminPlus`; stato per le due modali (voceId
  attivo); passa `isAdminPlus` e gli handler a `StoricoTabella`; al salvataggio
  modifica → ricarica la pagina corrente (`carica`) per riflettere righe+contatori.
- `StoricoTabella`: nuova colonna **Azioni** (ultima): **📷** (sempre) e **✎**
  (solo se `isAdminPlus`), con callback `onFoto(voceId)` / `onModifica(voceId)`.
  La colonna Azioni è `sticky right-0` opzionale (semplice: in coda, scroll x).
- `ModaleFotoVoce` (nuovo): props `{ voceId, onClose }`. Al mount fa GET foto,
  mostra spinner, poi griglia di anteprime (img signed URL) con link "apri"; stato
  "Nessuna foto" se vuoto; errore gestito.
- `ModaleModificaVoce` (nuovo, admin_plus): props `{ voceId, onClose, onSaved }`.
  Al mount fa GET editor; rende sezione **Anagrafica** (input testo per i 9 campi)
  + sezione **Esiti/Risposte** (input per `campi` per tipo: crocetta→checkbox,
  select→dropdown opzioni, numero→number, testo→textarea) + **Note** (textarea).
  Salva → PATCH → `onSaved()` (ricarica) + chiude. Spinner/disabilita durante save,
  errore in banner.

## Errori / edge

- Foto: path mancante nello storage → la foto è omessa dalla lista (best-effort);
  lista vuota → "Nessuna foto".
- Modifica: 403 se non admin_plus (anche se il bottone non compare); conflitti di
  merge gestiti da `mergeRisposte` (placeholder `blob-locale:` non sovrascrive path
  reali); intervento collegato annullato → non riaperto (come l'endpoint esistente).
- Whitelist colonne anagrafiche per evitare update arbitrari.

## Test (vitest, mirati)

- Helper puro nuovo `buildCampiEditor(campiSnapshot)` → filtra non-foto, normalizza
  `{chiave,etichetta,tipo,opzioni}`, garantisce presenza campo `note`. Test su
  filtro foto, ordinamento, note-aggiunta.
- Helper puro `estraiFotoPaths(risposte, campiFoto)` → lista path `rapportini/…`
  (riusa `comeArrayFoto`), ignora `blob-locale:`. Test.
- Helper puro `anagraficaPatchValida(body)` → whitelist colonne, scarta chiavi
  ignote. Test.
- Endpoint e modali: verifica integrazione (typecheck + build + smoke); la logica
  di merge/ripropagazione è già coperta dai test esistenti.

## Sicurezza

- Edit (GET editor + PATCH): **admin_plus** lato endpoint (non solo UI).
- Foto: `requireUser` (la pagina è già protetta dal permesso modulo); signed URL a
  scadenza breve.
- Whitelist colonne anagrafiche; nessuna modifica a esecutore/data.
