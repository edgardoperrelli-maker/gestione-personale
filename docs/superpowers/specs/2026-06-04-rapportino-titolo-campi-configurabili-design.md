# Design — Titolo voce + campi rapportino configurabili (config live dal template)

- **Data:** 2026-06-04
- **Stato:** approvato dall'utente (in attesa di revisione finale della spec)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · Vitest
- **Collegato a:** [Rapportini interattivi](2026-05-31-rapportini-interattivi-design.md) · [Template info dinamici](2026-06-03-rapportini-template-info-dinamici-design.md) · [Redesign mobile](2026-06-04-rapportino-mobile-redesign-design.md)

---

## 1. Contesto e obiettivo

Nel rapportino digitale (`/r/[token]`) l'**intestazione di ogni voce** è oggi **hardcoded**:
`nominativo → pdr → "Voce N"` ([RapportinoForm.tsx:180](../../../components/modules/rapportini/RapportinoForm.tsx), [VoceFocus.tsx:38](../../../components/modules/rapportini/VoceFocus.tsx)). Per i template senza nominativo (es. **ACEA**) esce "Voce 1", "Voce 2"… — inutile.

L'admin deve poter **decidere per ogni template** (esistenti e futuri) **cosa mostrare come titolo** della voce (es. indirizzo, ODS/ODL, PDR…), e queste scelte devono valere **anche sui rapportini già generati**, non solo sui nuovi.

I **campi anagrafici** ("Informazioni da mostrare") sono **già configurabili** per template ([TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx)) e l'elenco include già `ODS/ODL`. Restano due limiti da rimuovere: (a) non c'è config del **titolo**; (b) la config (titolo + anagrafica) è **congelata** alla generazione (`info_snapshot`) → modifiche al template non si riflettono sui rapportini già creati.

**Obiettivo:** rendere **titolo** e **campi anagrafici** configurabili per template, con effetto **immediato su tutti i rapportini** (live dal template), senza toccare i dati compilati né le API di compilazione/invio.

## 2. Scope

**In scope:**
- Nuova config **`titolo_campi`** per `rapportino_template` (lista ordinata di chiavi info; titolo = primo campo non vuoto).
- UI admin: sezione **"Intestazione della card"** ([TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx)) + accettazione/validazione in [api/admin/rapportino-template](../../../app/api/admin/rapportino-template/route.ts).
- **Lettura live** della config display (titolo + info) dal template collegato nella rotta pubblica ([app/r/[token]/page.tsx](../../../app/r/[token]/page.tsx)), con fallback allo snapshot congelato.
- Helper puro **`titoloVoce`** + uso in [RapportinoForm.tsx](../../../components/modules/rapportini/RapportinoForm.tsx) e [VoceFocus.tsx](../../../components/modules/rapportini/VoceFocus.tsx).
- Migrazione SQL additiva (colonna `titolo_campi`).

**Fuori scope (non-goals):**
- Nuovi campi-dato da `raw_json` (l'utente ha confermato: nessuno). Il titolo/anagrafica usano i campi `InfoChiave` esistenti (gli 11, incl. `odl`).
- Modifiche alle rotte `/voce` e `/invia`, alla logica autosave, all'export Excel/Allegato 10.
- Cambiare i **campi compilabili** (`campi_snapshot`): restano **congelati** per integrità dei dati già inseriti.
- Titolo come **concatenazione** di più campi: il titolo è il **valore del primo campo non vuoto** (lista di priorità), non "via + comune" uniti.

## 3. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Titolo | **Lista di priorità** di chiavi: titolo = valore del **primo campo non vuoto**; se nessuno → "Voce N" |
| Retroattività | Config display (titolo + info) **letta live** dal template → vale su esistenti e futuri |
| Campi compilabili | Restano dal `campi_snapshot` **congelato** (no live) |
| Nuovi campi DB | **Nessuno** (si usano le 11 `InfoChiave`, incl. `odl`/ODS-ODL) |
| Migrazione prod | SQL additiva; lanciata **dall'utente** sul DB prod (consegnata su richiesta) |

## 4. Modello dati

Una sola colonna additiva su `rapportino_template`:

```sql
-- supabase/migrations/<ts>_rapportino_titolo_campi.sql
alter table rapportino_template
  add column if not exists titolo_campi jsonb not null default '[]';
-- titolo_campi = lista ordinata di chiavi InfoChiave, es. ["odl","via"]
```

- **Additiva e retro-compatibile**: il codice vecchio ignora la colonna; nessuna `info_snapshot`/`campi_snapshot` toccata.
- Nessuna colonna nuova su `rapportino_voci` (i valori sono già nelle 11 colonne snapshot + `raw_json`).
- `titolo_campi` vuoto (`[]`) = comportamento storico (titolo `nominativo → pdr → "Voce N"`).

## 5. Admin — sezione "Intestazione della card"

In [TemplateRapportiniClient.tsx](../../../app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx), accanto a "Informazioni da mostrare", una nuova sezione **"Intestazione della card"**:
- Lista ordinabile delle chiavi scelte per il titolo (add / rimuovi / sposta su-giù), **riusando** `INFO_CAMPI_DISPONIBILI` per il picker e lo stesso pattern UI della sezione info (niente etichette: il titolo mostra il **valore**, non un'etichetta).
- Hint: "Il titolo userà il **primo campo non vuoto** della lista; se tutti vuoti → 'Voce N'."
- Stato salvato come `titolo_campi: InfoChiave[]` nel payload del template.

**API** [api/admin/rapportino-template/route.ts](../../../app/api/admin/rapportino-template/route.ts): POST/PATCH accettano `titolo_campi`; validazione: array di chiavi ∈ `INFO_CAMPI_DISPONIBILI` (scarta sconosciute), no duplicati.

## 6. Render — lettura live del template

[app/r/[token]/page.tsx](../../../app/r/[token]/page.tsx) (Server Component):
1. Aggiungere **`template_id`** alla select del rapportino (oggi non c'è).
2. Caricare il **template collegato** in modo **non fatale**:
   ```ts
   const { data: tpl } = await supabaseAdmin
     .from('rapportino_template')
     .select('titolo_campi, info_campi')
     .eq('id', rap.template_id)
     .maybeSingle();
   ```
   Se `rap.template_id` è null, il template è stato cancellato, **o la colonna `titolo_campi` non esiste ancora** (migrazione non applicata → la select dà errore) → `tpl` è null → si usa il **fallback congelato** (`info_snapshot` + titolo storico). Così il deploy è **indipendente dall'ordine** rispetto alla migrazione: prima della migrazione resta il comportamento attuale, dopo si attiva il live-read.
3. Passare al form la config **live con fallback**:
   - `infoCampi = tpl?.info_campi ?? rap.info_snapshot ?? []`
   - `titoloCampi = tpl?.titolo_campi ?? []`
   - `campiSnapshot` resta **invariato** (dal `campi_snapshot` congelato).

Effetto: modificando il template, **titolo e campi anagrafici cambiano subito** su tutti i rapportini collegati (esistenti e futuri); i campi compilabili restano stabili.

## 7. Helper puro `titoloVoce`

In [utils/rapportini/infoCampi.ts](../../../utils/rapportini/infoCampi.ts):

```ts
/** Titolo della voce: primo campo non vuoto tra `titoloCampi`; default storico nominativo→pdr; poi "Voce N". */
export function titoloVoce(
  voce: VoceInfo,
  titoloCampi: InfoChiave[],
  indice: number,
): string {
  const chiavi = titoloCampi.length > 0 ? titoloCampi : (['nominativo', 'pdr'] as InfoChiave[]);
  for (const c of chiavi) {
    const v = valoreInfo(voce, c);
    if (v) return v;
  }
  return `Voce ${indice + 1}`;
}
```

- `titoloCampi` vuoto → comportamento storico (`nominativo → pdr → "Voce N"`).
- Riusa `valoreInfo` (gestisce null/trim) → coerente con anagrafica.
- **Sostituisce** l'hardcoded in `RapportinoForm.tsx` (righe VM, riga ~180) e `VoceFocus.tsx` (riga ~38). Entrambi i componenti ricevono `titoloCampi` come prop (dal form, che lo riceve da `page.tsx`).

## 8. Comportamento e stati

| Caso | Comportamento |
|---|---|
| `titolo_campi` configurato | Titolo = primo campo non vuoto (es. ACEA `["odl"]` → numero ODS/ODL) |
| `titolo_campi` vuoto/assente | Titolo storico `nominativo → pdr → "Voce N"` |
| Tutti i campi titolo vuoti su una voce | Fallback "Voce N" |
| Template cancellato / migrazione non applicata | `tpl` null → fallback a `info_snapshot` congelato + titolo storico (nessun crash) |
| Campi compilabili | Sempre dal `campi_snapshot` congelato (invariati) |
| Rapportino inviato/scaduto/bloccato | Invariati (solo display) |

## 9. Migrazione prod

La migrazione è **additiva e non-breaking**. Sequenza consigliata: l'utente lancia la SQL sul DB prod (Supabase) **prima** del deploy del codice; ma grazie al caricamento template **non fatale** (§6.2), anche se il deploy precede la migrazione la pagina **non si rompe** (resta sul comportamento storico finché la colonna non c'è). La SQL viene **consegnata all'utente su richiesta** (preferenza: la lancia lui, niente esecuzione automatica). Il Supabase MCP **non** punta al DB prod, quindi non si applica da qui.

## 10. Testing

**Vitest (funzione pura):**
- `titoloVoce(voce, titoloCampi, indice)`:
  - `titoloCampi` vuoto → `nominativo`, poi `pdr`, poi `"Voce N"`;
  - `["odl"]` con odl valorizzato → valore odl; con odl vuoto → "Voce N";
  - `["odl","via"]` con odl vuoto e via valorizzata → via;
  - tutti vuoti → "Voce N".
- (Eventuale) validazione `titolo_campi` lato API (chiavi note, no duplicati).

**Build + verifica manuale:** `npx tsc --noEmit`, `npx eslint <file toccati>`, `npm run build`; verifica admin (config titolo salva/carica) e pubblico (titolo cambia, vale su rapportino già generato).

## 11. File coinvolti

| Area | File |
|---|---|
| Helper titolo (+ test) | `utils/rapportini/infoCampi.ts`, `utils/rapportini/infoCampi.test.ts` |
| Migrazione SQL (nuova) | `supabase/migrations/<ts>_rapportino_titolo_campi.sql` |
| Admin UI | `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` |
| Admin API | `app/api/admin/rapportino-template/route.ts` |
| Rotta pubblica | `app/r/[token]/page.tsx` (load template + props) |
| Render titolo | `components/modules/rapportini/RapportinoForm.tsx`, `components/modules/rapportini/VoceFocus.tsx` |

## 12. Fuori scope / passi futuri

- Snapshot del titolo sul rapportino (oggi si legge live; si potrebbe congelare in futuro se serve audit storico).
- Titolo come template stringa composito (`{via}, {comune}`) — oggi solo primo-non-vuoto.
- Esposizione di campi `raw_json` come campi-info selezionabili (non richiesto ora).
