# Ritiro dell'agente Playwright e di quello che ci girava attorno

**Data:** 2026-08-04 · **Stato:** approvato, da implementare

## Perché

L'agente locale (`tools/limitazioni-sync`) esisteva per una ragione sola: ACEA non dà un'API, e
l'unico modo di portare dentro il loro export era un browser pilotato — login su SAP Fiori,
download, riversamento sui file master.

**Quella ragione non esiste più.** L'aggiornamento di ACEA in tutte le sue attività avviene ora
per **import dal modulo ACEA**: ogni volta il file arriva nuovo e completo, e il registro
(`acea_ordini`) è la fonte. Il ponte non serve.

## Che cosa è già morto, misurato

| lavoro | ultimo giro | stato |
|---|---|---|
| `acea-stato` (export → master) | 03/08, **fallito** («Foglio "Foglio1" non trovato») | l'unico ancora innescato, ora sostituito dall'import |
| `acea-master` | 03/08 | 117 giri, **0 celle scritte** in tutta la sua vita |
| `sync` (massive → SharePoint) | 28/07 | superato dai moduli master |
| `acea-assegna` (scrive le assegnazioni sul portale) | **29/06** | fermo da cinque settimane |
| `acea-sal` | 10/07 | usato una volta |
| `agente_pianificabili` (input di Assegnazione AI) | **29/06** | fermo da cinque settimane |

Su 158 giri di `acea-stato`, **19 sono falliti** (12%), gli ultimi due ieri. Il canale che serviva
davvero è anche quello che si rompe di più.

**Assegnazione AI se ne va con l'agente**: il suo input sono i pianificabili scansionati dai file
master, fermi dal 29/06. L'utente ha confermato che il modulo non si usa più.

## Cosa si toglie

**Codice**
- `tools/limitazioni-sync/` — agente, driver Playwright, librerie
- `lib/agente/*`
- modulo **Agente**: `app/hub/agente/`, `components/modules/agente/`, voce in `APP_MODULES`
- modulo **Assegnazione AI**: `app/hub/assegnazione-ai/`, `components/modules/assegnazione-ai/`,
  voce in `APP_MODULES`
- endpoint verso l'agente: `/api/agente/{tick,report,pianificabili,acea-assegnazioni}`
- endpoint admin: tutta `/api/admin/agente/*`
- il bottone «Allinea» in Produzione economica (`PerformanceEconomica.tsx`)

**Dati** — `agente_config`, `agente_run`, `agente_file_colonne`, `agente_pianificabili`,
`acea_preassegnati`.

## Cosa resta, e perché non si rompe niente

**La Produzione economica non perde un dato.** `caricaComuniMassive()` unisce già due fonti: il
registro `acea_ordini` (famiglia `massive`) e i file master dell'agente. Sui dati veri il registro
ne conosce **cinque** — ZAGAROLO, RIANO, LABICO, RIGNANO FLAMINIO, BRACCIANO — contro i **due**
master che l'agente aveva scansionato. Togliendo `daMaster()` il file torna a una fonte sola ed è
più semplice di adesso. Il commento in `lib/produzione/comuniMassive.ts` prevedeva già questo
giorno: «quando l'agente sarà ritirato, la fonte 2 sparirà da sola».

Restano `lib/acea/comuniMassive.ts` (la fonte registro) e `lib/apiExportKey.ts` se altri endpoint
lo usano — da verificare in fase di rimozione, non si porta via un helper condiviso.

## L'ordine, che non è arbitrario

1. **Spegnimento** — via i bottoni e gli endpoint che *armano* i giri. Da qui il Playwright non
   può più partire, da nessuna macchina: non serve sapere quale PC lo ospita, e sul PC di questa
   sessione un task pianificato non esiste nemmeno.
2. **Rimozione del codice** — moduli, endpoint, tool, lib.
3. **Tabelle** — per ultime.

Il DB in fondo perché è l'unico passo che un `git revert` non annulla.

## Le tabelle: export, poi drop

Prima del drop, `agente_run` (423 giri) viene esportato in un file **fuori dal repo** — è storico
operativo e il repo è pubblico. Poi si droppano tutte e cinque.

L'export non è cerimonia: toglie l'irreversibilità dall'unico passo che ce l'ha, e costa un
comando.

## Test

I test dell'agente se ne vanno con il codice che coprivano. Si aggiunge **una guardia**: nessun
file sotto `app/`, `components/`, `lib/` deve importare da `lib/agente` o `tools/limitazioni-sync`.
È il test che si accorge di un filo lasciato attaccato.

La prova vera resta la **suite intera verde**: se togliendo l'agente si rompe qualcosa che nessuno
sapeva dipendesse da lui, è lì che si vede.

## Fuori scope

Ri-basare Assegnazione AI sul registro (il modulo se ne va). Il badge «già assegnato su ACEA» —
muore con `acea_preassegnati`; se un giorno servisse, il dato è nel registro
(`acea_ordini.operatore_cognome`, che l'import porta) e sarà una feature nuova, non un recupero.
