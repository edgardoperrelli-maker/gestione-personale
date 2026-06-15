# Redesign editor "Template rapportini" — divisione classici / manuali

Data: 2026-06-15
Stato: approvato (design), in attesa del piano di implementazione

## Contesto e problema

L'editor dei template vive in `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`
(~880 righe in un unico file). È una colonna verticale che, per qualunque template, mostra
*tutte* le sezioni impilate: Nome → Committente/Tipo → Card lista interventi → Dettaglio card →
Dettaglio anagrafica → Lista azioni → Priorità nome foto.

Due cose concettualmente diverse convivono nello stesso form indifferenziato:

- **Template classici (pianificati)** — `solo_manuale = false`. Generano i rapportini dai piani
  importati. Possono essere di `tipo` `standard` o `risanamento` (rapportino gerarchico, foto per
  sezione misuratore/fase/accessoria).
- **Template per interventi manuali** — `solo_manuale = true`. Usati solo dalla modale "+"
  dell'operatore, instradati per `committente`.

Difetti che generano confusione:

1. La distinzione classico/manuale è una **checkbox sepolta** a metà form ("Solo interventi manuali").
2. A un template manuale vengono mostrate sezioni inutili (titolo voce, coordinate, Tipo);
   a un classico vengono mostrate opzioni manuali.
3. La seconda dimensione (`tipo` standard/risanamento) è **annidata** dentro il riquadro
   "Committente", poco visibile ma cambia profondamente il rapportino.
4. Nessun raggruppamento: per arrivare ai campi bisogna scorrere oltre 4 riquadri di anagrafica.

Le funzioni sono tutte sane: il problema è **organizzazione e flusso**, non logica.

## Mappa funzionale (cosa serve a quale tipo)

| Sezione / proprietà | Classico (pianificato) | Manuale (`solo_manuale`) |
|---|:---:|:---:|
| Nome | sì | sì |
| Committente | opzionale (fallback default) | **obbligatorio** (instrada la modale) |
| Tipo standard/risanamento | sì (cambia il rapportino) | ignorato |
| Titolo della card voce (`titolo_campi`) | sì | non usato |
| Dettaglio card / coordinate | sì | no |
| Dettaglio anagrafica (`info_campi`) | sì (snapshot) | parziale (etichette form) |
| Azioni da fare (`campi`) | sì | sì |
| Flag "Obbligatoria" sui campi non-foto | ignorato | sì (avviso all'invio) |
| Sezione foto misuratore/fase (`scope_foto`) | sì, solo risanamento | no |
| Priorità nome foto (`foto_id_priority`) | sì (ZIP) | sì (naming upload) |

Riferimenti chiave a valle (NON toccati da questo lavoro):
- `solo_manuale` filtra i template manuali: `app/api/r/[token]/intervento-manuale/route.ts`,
  `app/r/[token]/page.tsx`, `app/hub/lista-attesa/page.tsx`.
- `committente` instrada il template manuale: `lib/interventi/manuali/risolviTemplateCommittente.ts`.
- `tipo` determina la struttura del rapportino: `lib/interventi/sincronizzaRapportini.ts`,
  `lib/rapportini/templateRisanamento.ts`, `app/r/[token]/page.tsx`.
- `info_campi` / `titolo_campi`: `utils/rapportini/infoCampi.ts`.
- `foto_id_priority`: `lib/interventi/manuali/fotoNaming.ts`.

## Obiettivi

- Dividere visivamente i template **classici** da quelli per **interventi manuali**.
- Mostrare, per ciascun tipo, **solo** le sezioni che lo riguardano.
- Ridurre il muro verticale con sezioni a fisarmonica (accordion).
- Mantenere **tutte** le funzioni esistenti, senza modifiche a DB/API/helper a valle.

## Non-obiettivi

- Nessuna modifica allo schema DB o agli endpoint API.
- Nessuna migrazione dati (i template esistenti si distribuiscono per `solo_manuale`).
- Nessuna modifica alla logica a valle (generazione rapportini, modale manuale, naming foto).
- Niente nuove proprietà del template.

## Decisioni di design (approvate)

- **Impianto**: A + fisarmonica interna — due schede in cima + editor adattivo con sezioni accordion.
- **Risanamento**: resta dentro la scheda Classici come selettore `Tipo: Standard | Risanamento`
  nelle Impostazioni base (no terza scheda).

## Architettura (scomposizione del file)

Il file unico viene scomposto in unità con responsabilità singola:

- `TemplateRapportiniClient.tsx` — orchestratore: stato, scheda attiva, lista filtrata,
  auto-save, save/delete. Mantiene la logica di stato esistente.
- `SchedeTipo.tsx` — le due schede (`Classici · pianificati` / `Interventi manuali`); controlla
  il filtro di lista/editor e il valore `solo_manuale` dei nuovi template.
- `ListaTemplate.tsx` — colonna sinistra, già filtrata per la scheda attiva.
- `SezioneAccordion.tsx` — wrapper riutilizzabile: titolo + chevron + stato aperto/chiuso +
  contenuto + slot anteprima.
- Sezioni presentazionali (ricevono dati + callback, niente stato globale interno):
  `SezioneBase`, `SezioneTitoloCard`, `SezioneAnagrafica`, `SezioneAzioni`, `SezioneFoto`.

Le anteprime esistenti (`AnteprimaBox`, `RigaVoceCard`, `VoceCard`, anteprima nome file) restano,
rese **dentro** l'accordion della sezione a cui si riferiscono.

## Comportamento

### Schede e `solo_manuale`
La scheda attiva sostituisce la checkbox "Solo interventi manuali":
- Scheda **Classici** → lista `solo_manuale = false`. Nuovo template ⇒ `solo_manuale = false`.
- Scheda **Manuali** → lista `solo_manuale = true`. Nuovo template ⇒ `solo_manuale = true`.

### Sezioni per tipo
- **Classici**: `Impostazioni base` (nome · Tipo Standard/Risanamento · committente opzionale) ·
  `Titolo della card voce` · `Dettaglio anagrafica` (+ coordinate) · `Azioni da fare` ·
  `Foto` (naming; sezioni misuratore/fase solo se Tipo = Risanamento).
- **Manuali**: `Impostazioni base` (nome · committente obbligatorio) · `Anagrafica da compilare` ·
  `Azioni da fare` (con flag "Obbligatoria" sui campi non-foto) · `Foto` (naming upload).
  Nascosti: Titolo card, Coordinate, selettore Tipo.

### Stato di apertura
Aperte di default: `Impostazioni base` e `Azioni da fare`. Le altre collassate.

### Auto-save e salvataggio
Invariati: debounce per i template esistenti, pulsante "Crea template" per i nuovi.
Lo stato auto-save ("Salvato ✓ / Salvataggio… / Non salvato") resta.

### Validazione
- Manuali: `committente` obbligatorio (oggi non lo è) → blocco con messaggio chiaro se manca,
  sia su "Crea template" sia in auto-save (non salva un manuale senza committente).
- Restano le validazioni esistenti: nome obbligatorio, almeno un campo, ogni campo con etichetta.

### Reattività Tipo
Cambiare il selettore Tipo a `Risanamento` mostra le opzioni `scope_foto` (misuratore/fase/accessoria)
e l'anteprima "Sezioni foto", come oggi; tornare a `standard` le nasconde.

## Edge case

- Template esistenti distribuiti per `solo_manuale` attuale — nessuna migrazione.
- Scheda senza template → empty-state ("Nessun template manuale. Creane uno.").
- Cambio scheda mentre si modifica un template → deseleziona ed empty-state dell'editor.
- Selezione di un template in una scheda e poi cambio scheda → selezione azzerata.
- Un eventuale template legacy con `committente` mancante in scheda Manuali → l'editor lo apre,
  ma il salvataggio richiede di impostare il committente (validazione sopra).

## Criteri di accettazione

1. In cima compaiono due schede; cliccandole la lista mostra solo i template di quel tipo.
2. Creando un template dalla scheda Manuali, `solo_manuale = true` senza alcuna checkbox.
3. Nella scheda Manuali non compaiono: Titolo card, Coordinate, selettore Tipo.
4. Nella scheda Classici compare il selettore Tipo; scegliendo Risanamento compaiono le sezioni foto.
5. Le sezioni sono accordion; `Impostazioni base` e `Azioni da fare` aperte di default.
6. Il committente è obbligatorio per i Manuali (messaggio se manca; non salva senza).
7. Tutte le funzioni preesistenti producono lo stesso payload verso `/api/admin/rapportino-template`.
8. Nessuna modifica a DB/API/helper; nessuna SQL.

## Verifica

- Lint/test mirati sui file toccati (baseline repo già rossa su lint/test globali — vedi memo
  "Lint/test baseline rosso"): `npx eslint <file>` e build dei tipi.
- Smoke manuale sull'editor: creare un classico standard, un classico risanamento, un manuale;
  verificare payload e che i template esistenti si aprano correttamente.
