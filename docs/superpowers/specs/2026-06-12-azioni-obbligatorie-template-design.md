# Azioni obbligatorie nei template — avviso all'invio (modale manuale)

**Data:** 2026-06-12
**Stato:** Design in revisione

## Contesto
Nel template editor ([TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx)) la
sezione "Lista azioni da fare" edita i `campi` del template. Oggi il flag **`obbligatoria`** è esposto
**solo per i campi `foto`** ([righe 656-687](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx:656))
ed è fatto valere solo sulle foto (`validaFotoObbligatorie`, `righeIncomplete`, `contaFotoObbligatorieMancanti`).
Per i campi **testo / select / numero / crocetta** non c'è né checkbox né enforcement.

L'utente vuole poter marcare le **azioni (campi non-foto) come obbligatorie da compilare** e farle valere
all'invio dell'**intervento manuale** (Italgas / Acea / Limitazioni massive). Il campo `obbligatoria` esiste
già in `CampoSchema` ([templateSchema.ts](../../../lib/rapportini/templateSchema.ts)) → nessuna modifica DB.

## Decisioni (confermate)
1. **Dove vale:** SOLO la **modale intervento manuale** ([ModaleInterventoManuale.tsx](../../../components/modules/rapportini/ModaleInterventoManuale.tsx)).
   Il rapportino pianificato standard resta invariato (l'invio lì dipende solo da "ogni voce ha un esito").
2. **Comportamento:** **avviso NON bloccante** all'invio — *"Mancano N campi obbligatori: … Inviare comunque?"*
   (OK → procede). Coerente con l'avviso foto attuale. Le **foto** obbligatorie restano invece a blocco rigido (come oggi).
3. **Editor:** la checkbox "Obbligatoria" non-foto è visibile **solo sui template "Solo interventi manuali"** (`solo_manuale=true`),
   così appare esattamente dove viene fatta valere (non illude su un obbligo sui template standard).
4. **Semantica del "vuoto":** crocetta obbligatoria = "deve essere **spuntata** (`true`)"; testo/select = "stringa non vuota";
   numero = "valorizzato" (lo `0` è valido).

## 1. Editor — checkbox "Obbligatoria" sui campi non-foto
In ogni card della "Lista azioni da fare", per i campi con `tipo !== 'foto'` **e** quando `soloManuale === true`,
mostro una riga con una checkbox **"Obbligatoria"** che lega `campo.obbligatoria` (riusa `updateCampo(idx, { obbligatoria })`).
Il blocco foto esistente (scope + obbligatoria) resta invariato. L'auto-save già persiste `campi` → il flag viene salvato senza altre modifiche.

## 2. Funzione pura `campiObbligatoriMancanti`
Nuova `lib/interventi/manuali/campiObbligatoriMancanti.ts` (+test). Firma:
```ts
campiObbligatoriMancanti(campi: TemplateCampo[], risposte: Record<string, unknown>): string[]
```
Ritorna le **etichette** dei campi con `tipo !== 'foto'` e `obbligatoria === true` rimasti vuoti, dove "vuoto" è:
- **crocetta:** `risposte[chiave] !== true`;
- **numero:** `v == null || (typeof v === 'string' && v.trim() === '')` (lo `0` numerico NON è vuoto);
- **testo / select (default):** `!(typeof v === 'string' && v.trim() !== '')`.

## 3. Modale manuale — avviso all'invio
In [ModaleInterventoManuale](../../../components/modules/rapportini/ModaleInterventoManuale.tsx), in `handleInvia`
(step 4, prima dell'upload): calcolo `mancanti = campiObbligatoriMancanti(campiEsito, risposte)`; se `mancanti.length > 0`
mostro `window.confirm("Mancano " + mancanti.length + " campi obbligatori da compilare: " + mancanti.join(', ') + ". Inviare comunque?")`.
Se l'utente annulla → `return` (resta nella modale). Se conferma → prosegue l'invio invariato. Le foto obbligatorie
restano gestite come oggi (bottone "Invia" disabilitato finché `esitoFoto.ok` è false).

## File toccati
- **Nuovi:** `lib/interventi/manuali/campiObbligatoriMancanti.ts` (+`.test.ts`).
- **Modificati:** `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` (checkbox non-foto, gated `soloManuale`),
  `components/modules/rapportini/ModaleInterventoManuale.tsx` (avviso in `handleInvia`).

## Testing
- **Pure fn** `campiObbligatoriMancanti` → unit (vitest): crocetta non spuntata = mancante; testo/select vuoto = mancante;
  numero `0` = NON mancante; campi foto ignorati; non-obbligatori ignorati; tutti compilati → `[]`.
- **Editor + modale:** gate `tsc`/`eslint` mirati; prova manuale sul deploy.
- Baseline lint/test già rossa su main → verifica mirata sui soli file del WP.

## Fuori scope
- Enforcement nel **rapportino pianificato standard** (resta invariato).
- **Blocco rigido** per i campi non-foto (scelto l'avviso non bloccante).
- Modifiche allo schema DB (il flag `obbligatoria` esiste già).
