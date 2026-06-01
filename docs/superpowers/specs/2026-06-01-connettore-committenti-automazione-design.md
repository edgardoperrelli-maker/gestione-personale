# Design — Connettore committenti (automazione Playwright Acea/Italgas)

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente · **nessun codice ancora** (spec)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack previsto:** worker Node separato · Playwright · Supabase (service role) · TypeScript · cron/queue
- **Collegato a:** [Coordinamento operatori & tracciatura interventi](2026-06-01-coordinamento-operatori-interventi-design.md) · [Data-model interventi Acea](2026-06-01-interventi-acea-datamodel-design.md)

---

## 1. Contesto e obiettivo

La Dashboard deve diventare l'**hub unico**: oggi gli interventi si recuperano accedendo a mano ai portali dei committenti (Acea **"Web Appalti"**, Italgas) e scaricando file Excel. Obiettivo: un **bot in background** che fa login, scarica gli Excel e li importa negli `interventi`, **eliminando progressivamente** il lavoro manuale e gli Excel come strumento.

**Decisioni utente confermate:**
- **Accesso:** entrambi i portali offrono **interfaccia web da cui scaricare Excel** → il bot automatizza il *download*, non fa scraping di tabelle HTML.
- **2FA:** Italgas **nessuna**; Acea **OTP solo la mattina, alla prima connessione**.
- **Fase 1:** **solo lettura (pull)**.
- **Riconciliazione:** dopo le richieste di assegnazione ordini, il bot **riscarica** i dati per aggiornare gli stati e verificare i rapportini.

## 2. Perché Playwright (e cosa significa "addestrare")

Playwright **non è installato** nel repo: va aggiunto da zero in un servizio separato. È il motore consigliato perché:
- automatizza un **browser reale** (login + navigazione + click "scarica Excel");
- **Codegen** registra i flussi mentre l'operatore li esegue ("addestramento" per dimostrazione), generando lo script che poi viene irrobustito;
- è deterministico e ripetibile su volumi elevati.

Un **agente AI con browser (computer-use)** resta come *fallback* per gestire variazioni del portale o anomalie, non come runner unico (più lento/costoso/non deterministico).

## 3. Architettura

```
┌─────────────┐  cron   ┌──────────────────────┐   download .xlsx   ┌──────────────┐
│  Scheduler  │ ──────▶ │  Worker Playwright    │ ─────────────────▶ │ Acea/Italgas │
│  (queue)    │         │  (browser headless)   │ ◀───────────────── │  (web)       │
└─────────────┘         └───────────┬───────────┘   sessione/cookie  └──────────────┘
                                    │ parseExcelToTasks (riuso)
                                    ▼
                          ┌──────────────────┐   realtime   ┌─────────────┐
                          │ Supabase         │ ───────────▶ │  Dashboard  │
                          │ `interventi`     │              │  (Next.js)  │
                          └──────────────────┘              └─────────────┘
```

- **Worker separato:** Vercel/Next serverless non può ospitare un browser headless a lunga durata → servizio Node dedicato (PC ufficio sempre acceso o piccolo VPS/container) con Playwright.
- **Scheduler + coda:** cron lancia i job di sync; coda per ordinare/ritentare.
- **Persistenza:** scrive su Supabase (`interventi`) con service role; la Dashboard legge in tempo reale (Supabase Realtime).
- **Riuso:** l'Excel scaricato passa per `utils/routing/excelParser.ts` (`parseExcelToTasks`) — la pipeline di import che alimenta `interventi` (vedi spec data-model).

## 4. Flussi per committente

### 4.1 Italgas (non presidiato)
1. Login utente+password (nessun 2FA) con sessione/cookie persistiti.
2. Naviga alla sezione interventi → **scarica Excel**.
3. `parseExcelToTasks` → upsert `interventi` (`committente='italgas'`, `data`, `import_batch_id`).
4. Schedulabile più volte al giorno, completamente automatico.

### 4.2 Acea "Web Appalti" (sblocco OTP mattutino)
1. **Sblocco mattutino:** alla prima connessione del giorno il portale richiede **OTP** → passaggio umano una volta (l'operatore inserisce l'OTP in Dashboard/worker); la **sessione viene salvata** e riusata per il resto della giornata.
2. Login → naviga → **scarica Excel** degli Ordinativi di Lavoro (OdL).
3. `parseExcelToTasks` → upsert `interventi` (`committente='acea'`).
4. Sync successivi del giorno: nessun OTP (sessione valida) finché non scade.

> Stato "sessione Acea": modellare in Dashboard un indicatore "sbloccata/da sbloccare" con un'azione "Inserisci OTP".

## 5. Ciclo di riconciliazione (richiesto)

Dopo ogni **richiesta di assegnazione ordini** sulle piattaforme (anche se l'assegnazione vera è fase successiva), e a intervalli periodici, il bot **riscarica** i dati e:
1. **Aggiorna gli stati** degli `interventi` allineandoli al committente (fonte di verità per lo stato ufficiale: assegnato/eseguito/annullato ecc.).
2. **Verifica i rapportini** digitali confrontandoli col dato committente; segnala **discrepanze**:
   - esito/lettura/matricola che non coincidono;
   - rapportino mancante o non inviato per un intervento eseguito lato committente;
   - intervento presente sul committente ma assente in Dashboard (e viceversa).
3. Le discrepanze diventano **alert** in Dashboard (per operatore/giorno).

**Regole di matching:** chiave primaria per OdL/ODS; chiavi secondarie matricola contatore e PdR/utenza; `data`. Definire tolleranze (es. lettura entro ±, normalizzazione indirizzi).

## 6. Sicurezza e gestione credenziali

- **Credenziali in vault** (secret manager del worker), mai nel repo né in chiaro.
- **Sessioni/cookie** cifrati e persistiti per ridurre i login e gestire l'OTP Acea.
- **Service role Supabase** solo lato worker; la Dashboard non espone le credenziali committenti.
- **Log + screenshot** ad ogni step di errore; **alert** se la struttura del portale cambia (selettori non trovati).

## 7. Due diligence (da verificare prima della produzione)

- **ToS / contratto d'appalto:** l'automazione usa **credenziali proprie** su **dati propri** (legittima automazione del proprio lavoro), ma le condizioni d'uso dei portali o il contratto potrebbero vietare l'accesso automatizzato → **verificare** (idealmente concordare col committente).
- **CAPTCHA / anti-bot:** se presenti, complicano o bloccano l'RPA → da testare sui portali reali.
- **Manutenzione continua:** i portali cambiano → il connettore va manutenuto; prevedere monitoraggio e budget di manutenzione.

## 8. Dipendenza bloccante

Lo **schema esatto e l'API/portale Acea** sono descritti negli **Allegato 1 e Allegato 2** del Disciplinare Tecnico ("sistema gestionale dell'Appaltatore", test funzionali di avvio): **referenziati ma non presenti** nella documentazione fornita. Vanno **reperiti** prima dell'implementazione: potrebbero offrire un'integrazione ufficiale (flussi informatici) preferibile all'RPA.

## 9. Fasi di implementazione (future)

1. **Setup worker + Playwright** (progetto separato), vault credenziali, connessione Supabase.
2. **Flusso Italgas** (download → import) end-to-end, non presidiato.
3. **Flusso Acea** con sblocco OTP mattutino + sessione persistente.
4. **Riconciliazione** stati + verifica rapportini + alert in Dashboard.
5. (Successiva) **Push**: assegnazione ordini sui portali con dry-run + conferma umana + audit.

## 10. Fuori scope

- Esitazione tecnica e integrazione diretta API committenti (resta su tablet/portali).
- Push/assegnazione automatica sui portali in fase 1 (solo pull).
- Login operatore/PWA (si resta su token per i rapportini).
