# Modulo "Agente" — Piano A: backend + agente config-driven

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere l'agente limitazioni massive interamente guidato dall'app (giorni/ora/dryRun/on-off, mappa di scrittura configurabile per nome colonna, testi esito) con endpoint tick/report e rilevamento colonne; più il fix date.

**Architecture:** App = cervello (decide in Europe/Rome, restituisce mappa+testi al tick), agente = operaio (tick orario → esegue se l'app dice sì, scrive per nome-colonna secondo la mappa, invia report+colonne). Endpoint protetti dalla chiave condivisa; export endpoint reso **additivo** (aggiunge `esitoOk`/`pdr`/`nominativo`, mantiene `esito`).

**Tech Stack:** Next.js 15 (route nodejs), Supabase (`supabaseAdmin`), TypeScript, Vitest; agente Node ESM `.mjs` + `exceljs`. Spec: `docs/superpowers/specs/2026-06-16-modulo-agente-design.md` (§1b mappa/colonne, §1c hardening).

**Contratti/decisioni:** vedi la spec §1b/§1c. Convenzioni: giorni ISO 1=Lun…7=Dom; ora "HH:MM"; fuso Europe/Rome; exceljs col = index0+1; gate **mirati** (`npx vitest run <file>`, `npx tsc --noEmit` senza nuovi errori, `npx eslint <file>`, `node --check` per i .mjs); baseline repo lint/test già rossa.

> **Ordine:** prima Part A (logica pura), poi Part B (export additivo + DB + endpoint), poi Part C (agente). Il Piano B (UI) è in `2026-06-16-modulo-agente-B-ui.md` e va eseguito dopo questo.

---

## ⚠️ Correzioni obbligatorie (da verifica adversarial — applicarle DENTRO le Task indicate)
Le Task qui sotto sono una bozza generata in parallelo. Una review adversarial ha trovato questi punti, da correggere **mentre** si implementa (la review a due stadi li deve far rispettare):

1. **`scanColonne` con throttle (Part C, spec §1c).** `main()` NON deve aprire i file Excel a ogni tick orario. Regola: esegui `scanColonne` **solo** se (a) la decisione del tick è `eseguiOra=true`, **oppure** (b) è passato ≥1 giorno dall'ultimo scan (file `scanColonne.stamp` accanto a `config.json` con la data ISO dell'ultimo scan; assente o di ieri → scansiona e riscrivi lo stamp). Negli altri tick invia `tick({})` SENZA `files`. Niente apertura OneDrive 24×/giorno.
2. **`normNome` Windows-safe (Part C2).** SOLO escape unicode, mai caratteri letterali: `.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toLowerCase()`. Test: `normNome('Località') === normNome('LOCALITA ')` e con NBSP.
3. **`scanColonne.mjs` senza placeholder (Part C3).** Scrivi subito la versione finale: per ogni file valido (STESSA selezione di `eseguiGiro`: *.xlsx, no `~$`/`_backup`/`_log`) carica il workbook, prendi le intestazioni dalla riga di `trovaRigaIntestazione`, `isMaster=isFileMaster(header)`, **popola l'output per i file validi** (non solo nel `catch`); `try/catch` per-file che non blocca.
4. **Conteggio comune-mismatch (Part C5, §1c).** Nel report aggiungi `comuniNonAgganciati`: matricole di `lavori` con `comune` che non corrisponde a nessun file master. Nel report + (Piano B) card.
5. **Marcatore = `'AGGIUNTA APP'` (Part C5).** Usa la costante `MARKER='AGGIUNTA APP'` esistente; assert che la cella valga esattamente `'AGGIUNTA APP'`. Solo righe extra, solo se cella vuota.
6. **Data date-aware anche sugli extra (Part C5).** Le righe extra scrivono la data via `aDataExcel`; assert e2e `giornoDa(<cella data extra>) === l.data_esecuzione`.
7. **`statoAgente` (Part A4/Piano B).** Tieni la firma con input pre-digerito (`minutiDaContatto`, `oraCorrente`, `weekday`, `ultimoGiroOggi`); la pagina calcola `minutiDaContatto` e lo passa al client. (Divergenza voluta dalla spec §2.)
8. **Warning UI colonne (Piano B, §1c).** Card "Colonne & scrittura": evidenzia intestazioni **duplicate** per-file e segnala quando un campo abilitato mappa un nome **assente** in qualche file (regola saltata).
9. **`colonnaMarker` (Part C5).** Funzione ESISTENTE in `colonne.mjs` (prima intestazione vuota dopo le note, altrimenti lunghezza riga): NON reimplementarla; verificala col test e2e sul fixture.

---

### Task A1 — `partiRoma` (orarioRoma.ts)

Helper Rome-aware che da un `Date` ricava `{ oggi, oraCorrente, weekday }` in fuso `Europe/Rome` via `toLocaleString('sv-SE', …)`. Convenzione giorni ISO 1=Lun…7=Dom; ora `"HH:MM"` zero-pad.

**Files**
- `lib/agente/orarioRoma.ts` (nuovo)
- `lib/agente/orarioRoma.test.ts` (nuovo)

**Step**
- [ ] Scrivi il test `lib/agente/orarioRoma.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { partiRoma } from './orarioRoma';

  describe('partiRoma', () => {
    it('estrae oggi/oraCorrente/weekday in fuso Europe/Rome (ora legale, +2)', () => {
      // 2026-06-16 19:30 UTC === 21:30 a Roma (CEST)
      const r = partiRoma(new Date('2026-06-16T19:30:00Z'));
      expect(r.oggi).toBe('2026-06-16');
      expect(r.oraCorrente).toBe('21:30');
      expect(r.weekday).toBe(2); // martedì
    });

    it('rolla la data al giorno dopo a Roma quando a UTC è ancora il giorno prima', () => {
      // 2026-06-16 23:30 UTC === 2026-06-17 01:30 a Roma
      const r = partiRoma(new Date('2026-06-16T23:30:00Z'));
      expect(r.oggi).toBe('2026-06-17');
      expect(r.oraCorrente).toBe('01:30');
      expect(r.weekday).toBe(3); // mercoledì
    });

    it('ora solare (inverno, +1): 2026-01-15 12:00 UTC === 13:00 a Roma', () => {
      const r = partiRoma(new Date('2026-01-15T12:00:00Z'));
      expect(r.oggi).toBe('2026-01-15');
      expect(r.oraCorrente).toBe('13:00');
      expect(r.weekday).toBe(4); // giovedì
    });

    it('domenica ISO = 7', () => {
      // 2026-06-21 è domenica
      const r = partiRoma(new Date('2026-06-21T10:00:00Z'));
      expect(r.weekday).toBe(7);
    });

    it('lunedì ISO = 1', () => {
      // 2026-06-15 è lunedì
      const r = partiRoma(new Date('2026-06-15T10:00:00Z'));
      expect(r.weekday).toBe(1);
    });

    it('oraCorrente zero-pad su ore/minuti a una cifra', () => {
      // 2026-06-16 06:05 UTC === 08:05 a Roma (CEST)
      const r = partiRoma(new Date('2026-06-16T06:05:00Z'));
      expect(r.oraCorrente).toBe('08:05');
    });
  });
  ```
- [ ] Esegui (DEVE fallire — modulo assente):
  ```
  npx vitest run lib/agente/orarioRoma.test.ts
  ```
  Output atteso: errore di risoluzione import `./orarioRoma` / "No test files? — Failed to load".
- [ ] Implementa `lib/agente/orarioRoma.ts`:
  ```ts
  export type PartiRoma = {
    oggi: string;        // 'YYYY-MM-DD'
    oraCorrente: string; // 'HH:MM'
    weekday: number;     // 1=Lun … 7=Dom (ISO)
  };

  /**
   * Ricava data, ora e giorno della settimana (ISO 1..7) in fuso Europe/Rome.
   * Usa il locale 'sv-SE' che formatta come 'YYYY-MM-DD HH:MM:SS'.
   */
  export function partiRoma(now: Date): PartiRoma {
    // 'sv-SE' → "2026-06-16 21:30:45"
    const s = now.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
    const [datePart, timePart] = s.split(' ');
    const oggi = datePart;
    const oraCorrente = timePart.slice(0, 5); // "HH:MM"

    // weekday in inglese abbreviato → ISO 1..7
    const wd = now.toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' });
    const mappa: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    };
    const weekday = mappa[wd] ?? 1;

    return { oggi, oraCorrente, weekday };
  }
  ```
- [ ] Riesegui (DEVE passare):
  ```
  npx vitest run lib/agente/orarioRoma.test.ts
  ```
  Output atteso: `Test Files  1 passed`, `Tests  6 passed`.
- [ ] Gate mirati (nessun NUOVO errore):
  ```
  npx tsc --noEmit
  npx eslint lib/agente/orarioRoma.ts lib/agente/orarioRoma.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/orarioRoma.ts lib/agente/orarioRoma.test.ts
  git commit -m "feat(agente): partiRoma helper fuso Europe/Rome (TDD)"
  ```

---

### Task A2 — `decideEsecuzione` (decisione.ts)

Decisione pura "eseguo ora?": `true` sse `enabled` && `giorni.includes(weekday)` && `oraCorrente >= ora` (confronto stringa `"HH:MM"`) && `ultimaRivendicazione !== oggi`.

**Files**
- `lib/agente/decisione.ts` (nuovo)
- `lib/agente/decisione.test.ts` (nuovo)

**Step**
- [ ] Scrivi `lib/agente/decisione.test.ts` (solo i blocchi di questa Task; le Task A3–A7 aggiungono altri `describe` allo STESSO file):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { decideEsecuzione } from './decisione';

  const base = {
    enabled: true,
    giorni: [1, 2, 3, 4, 5],
    ora: '21:00',
    weekday: 2,
    oraCorrente: '21:30',
    oggi: '2026-06-16',
    ultimaRivendicazione: null as string | null,
  };

  describe('decideEsecuzione', () => {
    it('tutte le condizioni vere → true', () => {
      expect(decideEsecuzione(base)).toBe(true);
    });
    it('disabilitato → false', () => {
      expect(decideEsecuzione({ ...base, enabled: false })).toBe(false);
    });
    it('giorno non in elenco → false', () => {
      expect(decideEsecuzione({ ...base, weekday: 6 })).toBe(false);
    });
    it('ora corrente prima dell ora pianificata → false', () => {
      expect(decideEsecuzione({ ...base, oraCorrente: '20:59' })).toBe(false);
    });
    it('ora corrente esattamente uguale all ora → true (>=)', () => {
      expect(decideEsecuzione({ ...base, oraCorrente: '21:00' })).toBe(true);
    });
    it('già rivendicato oggi → false', () => {
      expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-16' })).toBe(false);
    });
    it('rivendicazione di un altro giorno → true', () => {
      expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-15' })).toBe(true);
    });
    it('confronto orario lessicografico zero-pad: 09:30 >= 09:00', () => {
      expect(decideEsecuzione({ ...base, ora: '09:00', oraCorrente: '09:30' })).toBe(true);
    });
  });
  ```
- [ ] Esegui (DEVE fallire — modulo assente):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `./decisione`.
- [ ] Crea `lib/agente/decisione.ts` con i tipi e la prima funzione:
  ```ts
  export type DecideEsecuzioneInput = {
    enabled: boolean;
    giorni: number[];      // ISO 1..7
    ora: string;           // "HH:MM"
    weekday: number;       // ISO 1..7
    oraCorrente: string;   // "HH:MM"
    oggi: string;          // "YYYY-MM-DD"
    ultimaRivendicazione: string | null; // "YYYY-MM-DD" | null
  };

  /**
   * true sse: abilitato && giorno pianificato && passata l'ora && non già
   * rivendicato oggi. Il confronto orario è lessicografico su "HH:MM" zero-pad.
   */
  export function decideEsecuzione(input: DecideEsecuzioneInput): boolean {
    const { enabled, giorni, ora, weekday, oraCorrente, oggi, ultimaRivendicazione } = input;
    return (
      enabled &&
      giorni.includes(weekday) &&
      oraCorrente >= ora &&
      ultimaRivendicazione !== oggi
    );
  }
  ```
- [ ] Riesegui (DEVE passare):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests  8 passed`.
- [ ] Gate mirati:
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): decideEsecuzione decisione pura giro giornaliero (TDD)"
  ```

---

### Task A3 — `riassumiReport` (decisione.ts)

Somma i conteggi dal report dell'agente in `{ lavori, aggiornate, extra, conflitti, nonCollocate }`. Robusto a campi mancanti.

**Files**
- `lib/agente/decisione.ts` (estendi)
- `lib/agente/decisione.test.ts` (aggiungi `describe`)

**Step**
- [ ] Aggiungi in cima al test l'import (estendi quello esistente) e un nuovo `describe`:
  ```ts
  import { decideEsecuzione, riassumiReport, type ReportAgente } from './decisione';
  ```
  (sostituisci la riga di import esistente con questa che aggiunge `riassumiReport` e `ReportAgente`)
  ```ts
  describe('riassumiReport', () => {
    it('somma lavori/aggiornate/extra/conflitti dai file[] + extraNonCollocate', () => {
      const report: ReportAgente = {
        lavori: 12,
        dryRun: false,
        file: [
          { aggiornate: 3, extraAggiunte: 1, conflitti: [{}, {}] },
          { aggiornate: 2, extraAggiunte: 0, conflitti: [{}] },
        ],
        extraNonCollocate: [{}, {}, {}],
      };
      expect(riassumiReport(report)).toEqual({
        lavori: 12,
        aggiornate: 5,
        extra: 1,
        conflitti: 3,
        nonCollocate: 3,
      });
    });

    it('report vuoto → tutti zero', () => {
      expect(riassumiReport({})).toEqual({
        lavori: 0, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
      });
    });

    it('campi opzionali mancanti nei file → trattati come 0/[]', () => {
      const report: ReportAgente = { file: [{}, { aggiornate: 4 }] };
      expect(riassumiReport(report)).toEqual({
        lavori: 0, aggiornate: 4, extra: 0, conflitti: 0, nonCollocate: 0,
      });
    });

    it('file assente del tutto → zero', () => {
      expect(riassumiReport({ lavori: 7 })).toEqual({
        lavori: 7, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
      });
    });

    it('extraNonCollocate assente → nonCollocate 0', () => {
      const report: ReportAgente = { file: [{ extraAggiunte: 2 }] };
      expect(riassumiReport(report).nonCollocate).toBe(0);
    });
  });
  ```
- [ ] Esegui (i test di `riassumiReport` DEVONO fallire — non esiste ancora):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `riassumiReport` / `ReportAgente`.
- [ ] Estendi `lib/agente/decisione.ts`:
  ```ts
  export type ReportFileAgente = {
    aggiornate?: number;
    extraAggiunte?: number;
    conflitti?: unknown[];
  };

  export type ReportAgente = {
    lavori?: number;
    dryRun?: boolean;
    file?: ReportFileAgente[];
    extraNonCollocate?: unknown[];
    erroreGlobale?: string;
  };

  export type RiassuntoReport = {
    lavori: number;
    aggiornate: number;
    extra: number;
    conflitti: number;
    nonCollocate: number;
  };

  /** Somma i conteggi dal report dell'agente; robusto ai campi mancanti. */
  export function riassumiReport(report: ReportAgente): RiassuntoReport {
    const file = report.file ?? [];
    let aggiornate = 0;
    let extra = 0;
    let conflitti = 0;
    for (const f of file) {
      aggiornate += f.aggiornate ?? 0;
      extra += f.extraAggiunte ?? 0;
      conflitti += (f.conflitti ?? []).length;
    }
    return {
      lavori: report.lavori ?? 0,
      aggiornate,
      extra,
      conflitti,
      nonCollocate: (report.extraNonCollocate ?? []).length,
    };
  }
  ```
- [ ] Riesegui (DEVE passare tutto il file):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests 13 passed` (8 A2 + 5 A3).
- [ ] Gate mirati:
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): riassumiReport somma conteggi del giro (TDD)"
  ```

---

### Task A4 — `statoAgente` (decisione.ts)

Calcola `{ online, allerta }` da `minutiDaContatto` e dalla pianificazione. `online` = contatto entro `onlineMin` (default 90). `allerta` = stringa se è un giorno pianificato, passata l'ora + grazia (`graziaMin`, default 120 min), e l'ultimo giro non è di oggi; altrimenti `null`.

**Files**
- `lib/agente/decisione.ts` (estendi)
- `lib/agente/decisione.test.ts` (aggiungi `describe`)

**Step**
- [ ] Aggiorna l'import del test per includere `statoAgente`:
  ```ts
  import { decideEsecuzione, riassumiReport, statoAgente, type ReportAgente } from './decisione';
  ```
  e aggiungi:
  ```ts
  describe('statoAgente', () => {
    const base = {
      minutiDaContatto: 5 as number | null,
      enabled: true,
      giorni: [1, 2, 3, 4, 5],
      ora: '21:00',
      oraCorrente: '23:30',
      weekday: 2,
      ultimoGiroOggi: false,
    };

    it('contatto recente → online true', () => {
      expect(statoAgente(base).online).toBe(true);
    });
    it('contatto oltre soglia (default 90 min) → online false', () => {
      expect(statoAgente({ ...base, minutiDaContatto: 120 }).online).toBe(false);
    });
    it('minutiDaContatto null (mai contattato) → online false', () => {
      expect(statoAgente({ ...base, minutiDaContatto: null }).online).toBe(false);
    });
    it('soglia online configurabile via onlineMin', () => {
      expect(statoAgente({ ...base, minutiDaContatto: 120, onlineMin: 180 }).online).toBe(true);
    });

    it('giorno pianificato, passata ora+grazia, giro non di oggi → allerta valorizzata', () => {
      // ora 21:00 + 120 min grazia = 23:00; oraCorrente 23:30 > 23:00
      expect(statoAgente(base).allerta).not.toBeNull();
    });
    it('giro già fatto oggi → nessuna allerta', () => {
      expect(statoAgente({ ...base, ultimoGiroOggi: true }).allerta).toBeNull();
    });
    it('giorno NON pianificato → nessuna allerta', () => {
      expect(statoAgente({ ...base, weekday: 6 }).allerta).toBeNull();
    });
    it('non ancora passata ora+grazia → nessuna allerta', () => {
      // 21:00 + 120 = 23:00; oraCorrente 22:30 < 23:00
      expect(statoAgente({ ...base, oraCorrente: '22:30' }).allerta).toBeNull();
    });
    it('disabilitato → nessuna allerta', () => {
      expect(statoAgente({ ...base, enabled: false }).allerta).toBeNull();
    });
    it('grazia configurabile via graziaMin (0 → allerta già a 21:00)', () => {
      const s = statoAgente({ ...base, oraCorrente: '21:00', graziaMin: 0 });
      expect(s.allerta).not.toBeNull();
    });
  });
  ```
- [ ] Esegui (i nuovi test DEVONO fallire):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `statoAgente`.
- [ ] Estendi `lib/agente/decisione.ts`:
  ```ts
  export type StatoAgenteInput = {
    minutiDaContatto: number | null;
    enabled: boolean;
    giorni: number[];
    ora: string;         // "HH:MM"
    oraCorrente: string; // "HH:MM"
    weekday: number;
    ultimoGiroOggi: boolean;
    onlineMin?: number;  // default 90
    graziaMin?: number;  // default 120
  };

  export type StatoAgente = {
    online: boolean;
    allerta: string | null;
  };

  /** Somma graziaMin a una "HH:MM" → nuova "HH:MM" (cap a 23:59). */
  function aggiungiMinuti(hhmm: string, minuti: number): string {
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    let tot = h * 60 + m + minuti;
    if (tot > 23 * 60 + 59) tot = 23 * 60 + 59;
    const hh = Math.floor(tot / 60);
    const mm = tot % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** Stato online + allerta "non gira da…" per il modulo. */
  export function statoAgente(input: StatoAgenteInput): StatoAgente {
    const onlineMin = input.onlineMin ?? 90;
    const graziaMin = input.graziaMin ?? 120;

    const online =
      input.minutiDaContatto !== null && input.minutiDaContatto <= onlineMin;

    const giornoPianificato = input.enabled && input.giorni.includes(input.weekday);
    const limite = aggiungiMinuti(input.ora, graziaMin);
    const passataOraGrazia = input.oraCorrente >= limite;

    const allerta =
      giornoPianificato && passataOraGrazia && !input.ultimoGiroOggi
        ? `L'agente non ha eseguito il giro di oggi (atteso entro le ${limite}).`
        : null;

    return { online, allerta };
  }
  ```
- [ ] Riesegui (DEVE passare):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests 23 passed` (8 + 5 + 10).
- [ ] Gate mirati:
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): statoAgente online + allerta non-gira-oggi (TDD)"
  ```

---

### Task A5 — `validaMappatura` + costanti mappa (decisione.ts)

Valida la lista di regole di scrittura: ogni `campo` ∈ `CAMPI_MAPPABILI`, `colonna` stringa, `abilitato` boolean, `auto?` boolean; nessun `campo` duplicato; anti-collisione marcatore↔colonna di altra regola abilitata.

**Files**
- `lib/agente/decisione.ts` (estendi)
- `lib/agente/decisione.test.ts` (aggiungi `describe`)

**Step**
- [ ] Aggiorna import del test:
  ```ts
  import {
    decideEsecuzione,
    riassumiReport,
    statoAgente,
    validaMappatura,
    CAMPI_MAPPABILI,
    type ReportAgente,
    type RegolaMappa,
  } from './decisione';
  ```
  e aggiungi:
  ```ts
  const regola = (campo: string, colonna: string, abilitato = true, auto?: boolean): RegolaMappa =>
    auto === undefined
      ? { campo, colonna, abilitato }
      : { campo, colonna, abilitato, auto };

  describe('CAMPI_MAPPABILI', () => {
    it('contiene i campi previsti incluso marcatore', () => {
      expect(CAMPI_MAPPABILI).toEqual([
        'esecutore', 'data', 'esito', 'sigillo', 'matricola',
        'via', 'pdr', 'nominativo', 'comune', 'marcatore',
      ]);
    });
  });

  describe('validaMappatura', () => {
    it('mappatura valida → ok', () => {
      const m = [regola('esecutore', 'Esecutore'), regola('esito', 'esito')];
      expect(validaMappatura(m)).toEqual({ ok: true, value: m });
    });
    it('non è un array → errore', () => {
      expect(validaMappatura('x' as unknown).ok).toBe(false);
    });
    it('campo sconosciuto → errore', () => {
      expect(validaMappatura([regola('pippo', 'X')]).ok).toBe(false);
    });
    it('colonna non stringa → errore', () => {
      expect(validaMappatura([{ campo: 'esito', colonna: 1, abilitato: true } as unknown as RegolaMappa]).ok).toBe(false);
    });
    it('abilitato non boolean → errore', () => {
      expect(validaMappatura([{ campo: 'esito', colonna: 'esito', abilitato: 'si' } as unknown as RegolaMappa]).ok).toBe(false);
    });
    it('auto non boolean → errore', () => {
      expect(validaMappatura([{ campo: 'marcatore', colonna: '', abilitato: true, auto: 'x' } as unknown as RegolaMappa]).ok).toBe(false);
    });
    it('campo duplicato → errore', () => {
      const m = [regola('esito', 'esito'), regola('esito', 'altra')];
      expect(validaMappatura(m).ok).toBe(false);
    });
    it('marcatore con colonna nominata uguale a quella di altra regola abilitata → errore', () => {
      const m = [regola('esito', 'esito'), regola('marcatore', 'esito', true, false)];
      const out = validaMappatura(m);
      expect(out.ok).toBe(false);
    });
    it('marcatore auto:true ignora la collisione (colonna libera auto-rilevata)', () => {
      const m = [regola('esito', 'esito'), regola('marcatore', '', true, true)];
      expect(validaMappatura(m).ok).toBe(true);
    });
    it('marcatore disabilitato non collide', () => {
      const m = [regola('esito', 'esito'), regola('marcatore', 'esito', false, false)];
      expect(validaMappatura(m).ok).toBe(true);
    });
    it('collisione contro regola disabilitata non conta', () => {
      const m = [regola('esito', 'esito', false), regola('marcatore', 'esito', true, false)];
      expect(validaMappatura(m).ok).toBe(true);
    });
  });
  ```
- [ ] Esegui (i nuovi DEVONO fallire):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `validaMappatura`/`CAMPI_MAPPABILI`/`RegolaMappa`.
- [ ] Estendi `lib/agente/decisione.ts`:
  ```ts
  export type RegolaMappa = {
    campo: string;
    colonna: string;
    auto?: boolean;
    abilitato: boolean;
  };

  export const CAMPI_MAPPABILI = [
    'esecutore', 'data', 'esito', 'sigillo', 'matricola',
    'via', 'pdr', 'nominativo', 'comune', 'marcatore',
  ] as const;

  export type EsitoValidazione<T> =
    | { ok: true; value: T }
    | { ok: false; errore: string };

  /** Valida la lista di regole di scrittura (mappa globale). */
  export function validaMappatura(input: unknown): EsitoValidazione<RegolaMappa[]> {
    if (!Array.isArray(input)) {
      return { ok: false, errore: 'La mappatura deve essere una lista.' };
    }
    const visti = new Set<string>();
    const regole: RegolaMappa[] = [];
    for (const r of input) {
      if (typeof r !== 'object' || r === null) {
        return { ok: false, errore: 'Ogni regola deve essere un oggetto.' };
      }
      const reg = r as Record<string, unknown>;
      if (typeof reg.campo !== 'string' || !(CAMPI_MAPPABILI as readonly string[]).includes(reg.campo)) {
        return { ok: false, errore: `Campo non valido: ${String(reg.campo)}.` };
      }
      if (typeof reg.colonna !== 'string') {
        return { ok: false, errore: `Colonna non valida per il campo ${reg.campo}.` };
      }
      if (typeof reg.abilitato !== 'boolean') {
        return { ok: false, errore: `Campo "abilitato" non booleano per ${reg.campo}.` };
      }
      if (reg.auto !== undefined && typeof reg.auto !== 'boolean') {
        return { ok: false, errore: `Campo "auto" non booleano per ${reg.campo}.` };
      }
      if (visti.has(reg.campo)) {
        return { ok: false, errore: `Campo duplicato nella mappatura: ${reg.campo}.` };
      }
      visti.add(reg.campo);
      const regola: RegolaMappa = {
        campo: reg.campo,
        colonna: reg.colonna,
        abilitato: reg.abilitato,
      };
      if (reg.auto !== undefined) regola.auto = reg.auto as boolean;
      regole.push(regola);
    }

    // anti-collisione: marcatore abilitato con colonna nominata (auto !== true)
    // non può usare la stessa colonna di un'altra regola abilitata.
    const marcatore = regole.find((r) => r.campo === 'marcatore');
    if (marcatore && marcatore.abilitato && marcatore.auto !== true && marcatore.colonna.trim() !== '') {
      const collisione = regole.some(
        (r) => r.campo !== 'marcatore' && r.abilitato && r.colonna === marcatore.colonna,
      );
      if (collisione) {
        return {
          ok: false,
          errore: `Il marcatore non può usare la colonna "${marcatore.colonna}" già usata da un'altra regola.`,
        };
      }
    }

    return { ok: true, value: regole };
  }
  ```
- [ ] Riesegui (DEVE passare):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests 35 passed` (23 + 1 CAMPI + 11 mappatura).
- [ ] Gate mirati:
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): validaMappatura + CAMPI_MAPPABILI anti-collisione marcatore (TDD)"
  ```

---

### Task A6 — `validaConfig` (decisione.ts)

Valida e normalizza l'intera config: `giorni` 1..7, `ora` regex `HH:MM`, `finestra_giorni` 1..60, mappatura (via `validaMappatura`), `esito_positivo`/`esito_negativo` stringhe non vuote.

**Files**
- `lib/agente/decisione.ts` (estendi)
- `lib/agente/decisione.test.ts` (aggiungi `describe`)

**Step**
- [ ] Aggiorna import del test per includere `validaConfig`:
  ```ts
  import {
    decideEsecuzione,
    riassumiReport,
    statoAgente,
    validaMappatura,
    validaConfig,
    CAMPI_MAPPABILI,
    type ReportAgente,
    type RegolaMappa,
  } from './decisione';
  ```
  e aggiungi:
  ```ts
  describe('validaConfig', () => {
    const cfgOk = () => ({
      enabled: true,
      giorni: [1, 2, 3, 4, 5],
      ora: '21:00',
      dry_run: true,
      finestra_giorni: 15,
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
      ],
      esito_positivo: 'eseguito',
      esito_negativo: 'No',
    });

    it('config valida → ok con value normalizzato', () => {
      const out = validaConfig(cfgOk());
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.giorni).toEqual([1, 2, 3, 4, 5]);
        expect(out.value.ora).toBe('21:00');
        expect(out.value.mappatura).toHaveLength(2);
      }
    });

    it('enabled non boolean → errore', () => {
      expect(validaConfig({ ...cfgOk(), enabled: 'si' }).ok).toBe(false);
    });

    it('giorni non array → errore', () => {
      expect(validaConfig({ ...cfgOk(), giorni: 3 }).ok).toBe(false);
    });
    it('giorni vuoti → errore', () => {
      expect(validaConfig({ ...cfgOk(), giorni: [] }).ok).toBe(false);
    });
    it('giorno fuori range (0) → errore', () => {
      expect(validaConfig({ ...cfgOk(), giorni: [0, 1] }).ok).toBe(false);
    });
    it('giorno fuori range (8) → errore', () => {
      expect(validaConfig({ ...cfgOk(), giorni: [1, 8] }).ok).toBe(false);
    });
    it('giorno non intero → errore', () => {
      expect(validaConfig({ ...cfgOk(), giorni: [1, 2.5] }).ok).toBe(false);
    });
    it('giorni duplicati → deduplicati e ordinati', () => {
      const out = validaConfig({ ...cfgOk(), giorni: [3, 1, 3, 2] });
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.value.giorni).toEqual([1, 2, 3]);
    });

    it('ora con formato sbagliato → errore', () => {
      expect(validaConfig({ ...cfgOk(), ora: '9:00' }).ok).toBe(false);
      expect(validaConfig({ ...cfgOk(), ora: '24:00' }).ok).toBe(false);
      expect(validaConfig({ ...cfgOk(), ora: '21:60' }).ok).toBe(false);
      expect(validaConfig({ ...cfgOk(), ora: 'abc' }).ok).toBe(false);
    });
    it('ora 00:00 e 23:59 valide', () => {
      expect(validaConfig({ ...cfgOk(), ora: '00:00' }).ok).toBe(true);
      expect(validaConfig({ ...cfgOk(), ora: '23:59' }).ok).toBe(true);
    });

    it('dry_run non boolean → errore', () => {
      expect(validaConfig({ ...cfgOk(), dry_run: 1 }).ok).toBe(false);
    });

    it('finestra_giorni fuori range (0) → errore', () => {
      expect(validaConfig({ ...cfgOk(), finestra_giorni: 0 }).ok).toBe(false);
    });
    it('finestra_giorni fuori range (61) → errore', () => {
      expect(validaConfig({ ...cfgOk(), finestra_giorni: 61 }).ok).toBe(false);
    });
    it('finestra_giorni non intero → errore', () => {
      expect(validaConfig({ ...cfgOk(), finestra_giorni: 15.5 }).ok).toBe(false);
    });
    it('finestra_giorni 1 e 60 valide', () => {
      expect(validaConfig({ ...cfgOk(), finestra_giorni: 1 }).ok).toBe(true);
      expect(validaConfig({ ...cfgOk(), finestra_giorni: 60 }).ok).toBe(true);
    });

    it('mappatura invalida (campo sconosciuto) → errore', () => {
      expect(validaConfig({ ...cfgOk(), mappatura: [{ campo: 'pippo', colonna: 'X', abilitato: true }] }).ok).toBe(false);
    });

    it('esito_positivo vuoto → errore', () => {
      expect(validaConfig({ ...cfgOk(), esito_positivo: '' }).ok).toBe(false);
      expect(validaConfig({ ...cfgOk(), esito_positivo: '   ' }).ok).toBe(false);
    });
    it('esito_negativo non stringa → errore', () => {
      expect(validaConfig({ ...cfgOk(), esito_negativo: 5 }).ok).toBe(false);
    });
    it('esiti con spazi attorno → trim nel value', () => {
      const out = validaConfig({ ...cfgOk(), esito_positivo: '  eseguito  ', esito_negativo: ' No ' });
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.esito_positivo).toBe('eseguito');
        expect(out.value.esito_negativo).toBe('No');
      }
    });
  });
  ```
- [ ] Esegui (i nuovi DEVONO fallire):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `validaConfig`.
- [ ] Estendi `lib/agente/decisione.ts`:
  ```ts
  export type ConfigAgente = {
    enabled: boolean;
    giorni: number[];
    ora: string;
    dry_run: boolean;
    finestra_giorni: number;
    mappatura: RegolaMappa[];
    esito_positivo: string;
    esito_negativo: string;
  };

  const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

  /** Valida e normalizza l'intera configurazione dell'agente. */
  export function validaConfig(input: unknown): EsitoValidazione<ConfigAgente> {
    if (typeof input !== 'object' || input === null) {
      return { ok: false, errore: 'Configurazione assente.' };
    }
    const c = input as Record<string, unknown>;

    if (typeof c.enabled !== 'boolean') {
      return { ok: false, errore: 'Il campo "enabled" deve essere booleano.' };
    }

    if (!Array.isArray(c.giorni) || c.giorni.length === 0) {
      return { ok: false, errore: 'Seleziona almeno un giorno.' };
    }
    for (const g of c.giorni) {
      if (typeof g !== 'number' || !Number.isInteger(g) || g < 1 || g > 7) {
        return { ok: false, errore: 'I giorni devono essere interi da 1 (Lun) a 7 (Dom).' };
      }
    }
    const giorni = Array.from(new Set(c.giorni as number[])).sort((a, b) => a - b);

    if (typeof c.ora !== 'string' || !RE_ORA.test(c.ora)) {
      return { ok: false, errore: 'Ora non valida: usa il formato HH:MM (00:00–23:59).' };
    }

    if (typeof c.dry_run !== 'boolean') {
      return { ok: false, errore: 'Il campo "dry_run" deve essere booleano.' };
    }

    if (
      typeof c.finestra_giorni !== 'number' ||
      !Number.isInteger(c.finestra_giorni) ||
      c.finestra_giorni < 1 ||
      c.finestra_giorni > 60
    ) {
      return { ok: false, errore: 'La finestra deve essere un intero da 1 a 60 giorni.' };
    }

    const mapp = validaMappatura(c.mappatura);
    if (!mapp.ok) return { ok: false, errore: mapp.errore };

    if (typeof c.esito_positivo !== 'string' || c.esito_positivo.trim() === '') {
      return { ok: false, errore: 'Il testo esito positivo non può essere vuoto.' };
    }
    if (typeof c.esito_negativo !== 'string' || c.esito_negativo.trim() === '') {
      return { ok: false, errore: 'Il testo esito negativo non può essere vuoto.' };
    }

    return {
      ok: true,
      value: {
        enabled: c.enabled,
        giorni,
        ora: c.ora,
        dry_run: c.dry_run,
        finestra_giorni: c.finestra_giorni,
        mappatura: mapp.value,
        esito_positivo: c.esito_positivo.trim(),
        esito_negativo: c.esito_negativo.trim(),
      },
    };
  }
  ```
- [ ] Riesegui (DEVE passare):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests 57 passed` (35 + 22).
- [ ] Gate mirati:
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): validaConfig giorni/ora/finestra/esiti + mappatura (TDD)"
  ```

---

### Task A7 — `diffColonne` (decisione.ts)

Diff tra colonne precedenti e nuove: `{ nuove, sparite }`. Baseline al primo giro (precedenti vuote) → `nuove = []`.

**Files**
- `lib/agente/decisione.ts` (estendi)
- `lib/agente/decisione.test.ts` (aggiungi `describe`)

**Step**
- [ ] Aggiorna import del test per includere `diffColonne`:
  ```ts
  import {
    decideEsecuzione,
    riassumiReport,
    statoAgente,
    validaMappatura,
    validaConfig,
    diffColonne,
    CAMPI_MAPPABILI,
    type ReportAgente,
    type RegolaMappa,
  } from './decisione';
  ```
  e aggiungi:
  ```ts
  describe('diffColonne', () => {
    it('precedenti vuote → baseline: nuove vuote, sparite vuote', () => {
      expect(diffColonne([], ['A', 'B', 'C'])).toEqual({ nuove: [], sparite: [] });
    });
    it('colonna aggiunta → in nuove', () => {
      expect(diffColonne(['A', 'B'], ['A', 'B', 'C'])).toEqual({ nuove: ['C'], sparite: [] });
    });
    it('colonna rimossa → in sparite', () => {
      expect(diffColonne(['A', 'B', 'C'], ['A', 'C'])).toEqual({ nuove: [], sparite: ['B'] });
    });
    it('aggiunte e sparite insieme', () => {
      expect(diffColonne(['A', 'B'], ['B', 'C'])).toEqual({ nuove: ['C'], sparite: ['A'] });
    });
    it('nessuna differenza → entrambe vuote', () => {
      expect(diffColonne(['A', 'B'], ['A', 'B'])).toEqual({ nuove: [], sparite: [] });
    });
    it('preserva l ordine di "nuove" come in input nuove', () => {
      expect(diffColonne(['A'], ['A', 'C', 'B'])).toEqual({ nuove: ['C', 'B'], sparite: [] });
    });
    it('precedenti non vuote ma nuove vuote → tutte sparite', () => {
      expect(diffColonne(['A', 'B'], [])).toEqual({ nuove: [], sparite: ['A', 'B'] });
    });
    it('non muta gli array in input', () => {
      const prec = ['A', 'B'];
      const nuove = ['A', 'B', 'C'];
      diffColonne(prec, nuove);
      expect(prec).toEqual(['A', 'B']);
      expect(nuove).toEqual(['A', 'B', 'C']);
    });
  });
  ```
- [ ] Esegui (i nuovi DEVONO fallire):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: errore import `diffColonne`.
- [ ] Estendi `lib/agente/decisione.ts`:
  ```ts
  export type DiffColonne = {
    nuove: string[];
    sparite: string[];
  };

  /**
   * Diff tra lo snapshot precedente delle colonne e quello nuovo.
   * Primo giro (precedenti vuote) = baseline → nuove vuote (niente da evidenziare).
   */
  export function diffColonne(precedenti: string[], nuove: string[]): DiffColonne {
    if (precedenti.length === 0) {
      return { nuove: [], sparite: [] };
    }
    const setPrec = new Set(precedenti);
    const setNuove = new Set(nuove);
    return {
      nuove: nuove.filter((c) => !setPrec.has(c)),
      sparite: precedenti.filter((c) => !setNuove.has(c)),
    };
  }
  ```
- [ ] Riesegui (DEVE passare tutto il file):
  ```
  npx vitest run lib/agente/decisione.test.ts
  ```
  Output atteso: `Tests 65 passed` (57 + 8).
- [ ] Gate mirati (file completo):
  ```
  npx tsc --noEmit
  npx eslint lib/agente/decisione.ts lib/agente/decisione.test.ts
  ```
- [ ] Verifica finale di tutta la logica pura del modulo:
  ```
  npx vitest run lib/agente/decisione.test.ts lib/agente/orarioRoma.test.ts
  ```
  Output atteso: `Test Files  2 passed`, `Tests 71 passed`.
- [ ] Commit:
  ```
  git add lib/agente/decisione.ts lib/agente/decisione.test.ts
  git commit -m "feat(agente): diffColonne baseline + nuove/sparite (TDD)"
  ```

### Task B1 — Estrai `lib/apiExportKey.ts` e riusalo nell'export route

Estrae l'helper `chiaveValida(req)` (oggi inline in `app/api/export/limitazioni-massive/route.ts`) in un modulo condiviso byte-safe, così tick/report/export usano la stessa funzione.

**Files**
- `lib/apiExportKey.ts` (nuovo)
- `app/api/export/limitazioni-massive/route.ts` (modifica)

**Step**
- [ ] Crea `lib/apiExportKey.ts` con questo contenuto esatto:
```ts
import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Confronto byte-safe (timing-safe) della chiave export.
 * Legge `LIM_MASSIVE_EXPORT_KEY` dall'ambiente e la confronta con l'header
 * `x-export-key`. Estratta da app/api/export/limitazioni-massive/route.ts per
 * essere riusata da export + /api/agente/tick + /api/agente/report.
 */
export function chiaveValida(req: Request): boolean {
  const atteso = process.env.LIM_MASSIVE_EXPORT_KEY ?? '';
  const fornito = req.headers.get('x-export-key') ?? '';
  if (!atteso) return false;
  const a = Buffer.from(atteso);
  const f = Buffer.from(fornito);
  if (f.length !== a.length) return false;
  try {
    return timingSafeEqual(f, a);
  } catch {
    return false;
  }
}
```
- [ ] In `app/api/export/limitazioni-massive/route.ts` rimuovi l'import `timingSafeEqual` e la funzione locale `chiaveValida` (righe `import { timingSafeEqual } from 'node:crypto';` e l'intero blocco `function chiaveValida(req: Request): boolean { ... }`).
- [ ] Aggiungi l'import condiviso subito sotto `import { NextResponse } from 'next/server';`:
```ts
import { chiaveValida } from '@/lib/apiExportKey';
```
  La chiamata esistente `if (!chiaveValida(req)) {` dentro `GET` resta invariata.
- [ ] Verifica typecheck mirato (nessun NUOVO errore rispetto alla baseline):
```
npx tsc --noEmit
```
  Atteso: nessun errore che citi `apiExportKey.ts` o `app/api/export/limitazioni-massive/route.ts`.
- [ ] Verifica lint mirato sui due file toccati:
```
npx eslint lib/apiExportKey.ts app/api/export/limitazioni-massive/route.ts
```
  Atteso: nessun errore sui due file.
- [ ] Commit:
```
git add lib/apiExportKey.ts app/api/export/limitazioni-massive/route.ts
git commit -m "refactor(agente): estrai chiaveValida in lib/apiExportKey condiviso"
```

---

### Task B2 — `buildRigaLimMassive` additivo: `esitoOk`/`pdr`/`nominativo` (i test esistenti restano)

Aggiunge tre campi all'output della funzione pura MANTENENDO `esito` testuale (retro-compat). Prima i test (TDD), poi l'implementazione, poi la SELECT della route.

**Files**
- `lib/limitazione/exportLimMassive.test.ts` (modifica — i 8 test esistenti restano)
- `lib/limitazione/exportLimMassive.ts` (modifica)
- `app/api/export/limitazioni-massive/route.ts` (modifica — SELECT + mapping)

**Step**
- [ ] In `lib/limitazione/exportLimMassive.test.ts`, aggiorna l'oggetto `base` per includere i nuovi campi DB (servono ai nuovi test e non rompono gli esistenti). Sostituisci la costante `base` esistente con:
```ts
const base: RigaDb = {
  id: 'uuid-1', odl: ' 912231020 ', matricola_contatore: '20000020750',
  comune: 'ZAGAROLO', indirizzo: 'VIA CANCELLATA GRANDE 32', esito: 'eseguito_positivo',
  esito_motivo: null, stato: 'completato', data: '2026-06-03',
  committente: 'acea', origine: 'pianificato', display_name: 'CIARALLO SIMONE', sigillo: 'AA728566',
  pdr: ' 00123456789 ', nominativo: ' Rossi Mario ',
};
```
- [ ] Nel test esistente `'mappa e normalizza una riga pianificata positiva'`, aggiungi i tre campi all'oggetto atteso `toEqual` (altrimenti `toEqual` fallisce sui nuovi campi). Sostituisci il blocco `expect(buildRigaLimMassive(base)).toEqual({ ... })` con:
```ts
    expect(buildRigaLimMassive(base)).toEqual({
      id: 'uuid-1', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO',
      via: 'VIA CANCELLATA GRANDE 32', esecutore: 'CIARALLO', data_esecuzione: '2026-06-03',
      esito: 'eseguito', esito_motivo: null, sigillo: 'AA728566', manuale: false,
      esitoOk: true, pdr: '00123456789', nominativo: 'Rossi Mario',
    });
```
- [ ] Aggiungi in fondo al file un nuovo blocco `describe` per i campi additivi:
```ts
describe('buildRigaLimMassive — campi additivi esitoOk/pdr/nominativo', () => {
  it('esito positivo → esitoOk true, mantiene esito testuale', () => {
    const r = buildRigaLimMassive(base);
    expect(r.esitoOk).toBe(true);
    expect(r.esito).toBe('eseguito');
  });
  it('completato non positivo → esitoOk false, esito "No"', () => {
    const r = buildRigaLimMassive({ ...base, esito: 'accesso_negato' });
    expect(r.esitoOk).toBe(false);
    expect(r.esito).toBe('No');
  });
  it('non completato → esitoOk null, esito null', () => {
    const r = buildRigaLimMassive({ ...base, stato: 'assegnato' });
    expect(r.esitoOk).toBeNull();
    expect(r.esito).toBeNull();
  });
  it('pdr e nominativo trimmati', () => {
    const r = buildRigaLimMassive(base);
    expect(r.pdr).toBe('00123456789');
    expect(r.nominativo).toBe('Rossi Mario');
  });
  it('pdr e nominativo null → stringhe vuote', () => {
    const r = buildRigaLimMassive({ ...base, pdr: null, nominativo: null });
    expect(r.pdr).toBe('');
    expect(r.nominativo).toBe('');
  });
});
```
- [ ] Lancia i test PRIMA dell'implementazione (devono fallire sui nuovi campi):
```
npx vitest run lib/limitazione/exportLimMassive.test.ts
```
  Atteso: FAIL (es. `Property 'esitoOk' does not exist` / `esitoOk` undefined). I 5 nuovi falliscono, gli 8 esistenti possono fallire solo per il `toEqual` aggiornato.
- [ ] In `lib/limitazione/exportLimMassive.ts`, estendi `RigaLimMassive` aggiungendo i tre campi dopo `esito`:
```ts
export type RigaLimMassive = {
  id: string;
  odl: string;
  matricola: string;
  comune: string;
  via: string;
  esecutore: string;
  data_esecuzione: string; // 'YYYY-MM-DD'
  esito: 'eseguito' | 'No' | null;
  esitoOk: boolean | null; // true=positivo, false=lavorato-negativo, null=non lavorato
  esito_motivo: string | null;
  sigillo: string;
  pdr: string;
  nominativo: string;
  manuale: boolean;
};
```
- [ ] In `lib/limitazione/exportLimMassive.ts`, estendi `RigaDb` aggiungendo `pdr` e `nominativo` dopo `sigillo`:
```ts
export type RigaDb = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null; // 'YYYY-MM-DD'
  committente: string | null;
  origine: string | null;
  display_name: string | null;
  sigillo: string | null;
  pdr: string | null;
  nominativo: string | null;
};
```
- [ ] In `lib/limitazione/exportLimMassive.ts`, aggiungi un helper puro per `esitoOk` subito dopo `esitoFileDaIntervento` (riusa la stessa semantica di `stato`/`esito`):
```ts
/** true=positivo, false=lavorato-ma-negativo, null=non lavorato. Booleano gemello di esitoFileDaIntervento. */
export function esitoOkDaIntervento(
  stato: string | null | undefined,
  esito: string | null | undefined,
): boolean | null {
  if (stato !== 'completato') return null;
  return esito === 'eseguito_positivo' ? true : false;
}
```
- [ ] In `lib/limitazione/exportLimMassive.ts`, aggiorna `buildRigaLimMassive` per popolare i nuovi campi (l'ordine delle proprietà rispecchia il `toEqual` del test):
```ts
export function buildRigaLimMassive(r: RigaDb): RigaLimMassive {
  return {
    id: t(r.id),
    odl: t(r.odl),
    matricola: t(r.matricola_contatore),
    comune: t(r.comune),
    via: t(r.indirizzo),
    esecutore: cognomeDaDisplayName(r.display_name),
    data_esecuzione: t(r.data),
    esito: esitoFileDaIntervento(r.stato, r.esito),
    esitoOk: esitoOkDaIntervento(r.stato, r.esito),
    esito_motivo: t(r.esito_motivo) || null,
    sigillo: t(r.sigillo),
    pdr: t(r.pdr),
    nominativo: t(r.nominativo),
    manuale: r.committente === 'lim_massive' || r.origine === 'manuale',
  };
}
```
- [ ] Rilancia i test (ora tutti verdi: 8 esistenti + 5 nuovi):
```
npx vitest run lib/limitazione/exportLimMassive.test.ts
```
  Atteso: `Test Files 1 passed`, tutti i test passano.
- [ ] In `app/api/export/limitazioni-massive/route.ts`, aggiungi `pdr` e `nominativo` al tipo `InterventoRow` (dopo `intervento_tipo`):
```ts
type InterventoRow = {
  id: string;
  odl: string | null;
  matricola_contatore: string | null;
  comune: string | null;
  indirizzo: string | null;
  esito: string | null;
  esito_motivo: string | null;
  stato: string | null;
  data: string | null;
  committente: string | null;
  origine: string | null;
  staff_id: string | null;
  intervento_tipo: string | null;
  pdr: string | null;
  nominativo: string | null;
};
```
- [ ] Nella stessa route, aggiungi `pdr, nominativo` alla stringa `.select(...)` della query `interventi`. Sostituisci:
```ts
        .select(
          'id, odl, matricola_contatore, comune, indirizzo, esito, esito_motivo, stato, data, committente, origine, staff_id, intervento_tipo',
        )
```
  con:
```ts
        .select(
          'id, odl, matricola_contatore, comune, indirizzo, esito, esito_motivo, stato, data, committente, origine, staff_id, intervento_tipo, pdr, nominativo',
        )
```
- [ ] Nella stessa route, passa i due campi a `buildRigaLimMassive`. Nel blocco `interventi.map((i) => buildRigaLimMassive({ ... }))`, sostituisci la riga `sigillo: sigilloById.get(i.id) ?? null,` con:
```ts
        sigillo: sigilloById.get(i.id) ?? null,
        pdr: i.pdr,
        nominativo: i.nominativo,
```
- [ ] Typecheck + lint mirati:
```
npx tsc --noEmit
npx eslint lib/limitazione/exportLimMassive.ts app/api/export/limitazioni-massive/route.ts
```
  Atteso: nessun errore sui file toccati.
- [ ] Commit:
```
git add lib/limitazione/exportLimMassive.ts lib/limitazione/exportLimMassive.test.ts app/api/export/limitazioni-massive/route.ts
git commit -m "feat(agente): export additivo esitoOk/pdr/nominativo (esito testuale invariato)"
```

---

### Task B3 — Migration `20260616160000_agente.sql` (3 tabelle + singleton + RLS)

Crea `agente_config` (singleton id=1), `agente_run`, `agente_file_colonne`, con i default della mappatura e RLS `all_auth`. Migration sola — la lancia l'utente (non eseguirla qui).

**Files**
- `supabase/migrations/20260616160000_agente.sql` (nuovo)

**Step**
- [ ] Crea `supabase/migrations/20260616160000_agente.sql` con questo contenuto esatto:
```sql
-- ============================================================================
-- Modulo "Agente" — config singleton + storico giri + snapshot colonne file
-- Spec: docs/superpowers/specs/2026-06-16-modulo-agente-design.md (§1)
-- ============================================================================

-- Config singleton (una sola riga, id=1). L'app e' il cervello: l'agente
-- chiede al tick giorni/ora/dryRun/mappatura/testi-esito.
create table if not exists agente_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  giorni smallint[] not null default '{1,2,3,4,5}',   -- ISO: 1=Lun … 7=Dom
  ora text not null default '21:00',                   -- "HH:MM" Europe/Rome
  dry_run boolean not null default true,
  finestra_giorni smallint not null default 15,
  mappatura jsonb not null default '[{"campo":"esecutore","colonna":"Esecutore","abilitato":true},{"campo":"data","colonna":"data prevista","abilitato":true},{"campo":"esito","colonna":"esito","abilitato":true},{"campo":"sigillo","colonna":"sigillo posato","abilitato":true},{"campo":"marcatore","colonna":"","auto":true,"abilitato":true}]'::jsonb,
  esito_positivo text not null default 'eseguito',
  esito_negativo text not null default 'No',
  ultimo_giro_il timestamptz,
  ultimo_contatto_il timestamptz,
  ultima_rivendicazione_giorno date,                   -- giorno (Rome) dell'ultimo "eseguiOra=true"
  updated_at timestamptz not null default now()
);
insert into agente_config (id) values (1) on conflict (id) do nothing;

-- Storico dei giri (un insert per report).
create table if not exists agente_run (
  id uuid primary key default gen_random_uuid(),
  creato_il timestamptz not null default now(),
  dry_run boolean not null default false,
  lavori int not null default 0,
  aggiornate int not null default 0,
  extra int not null default 0,
  conflitti int not null default 0,
  non_collocate int not null default 0,
  errore text,
  dettaglio jsonb            -- report completo: file[], conflitti, extraNonCollocate
);
create index if not exists agente_run_creato_idx on agente_run (creato_il desc);

-- Snapshot delle colonne rilevate per file (per evidenziare nuove/sparite).
create table if not exists agente_file_colonne (
  file text primary key,
  is_master boolean not null default false,
  colonne text[] not null default '{}',
  colonne_nuove text[] not null default '{}',
  colonne_sparite text[] not null default '{}',
  rilevato_il timestamptz not null default now()
);

alter table agente_config enable row level security;
alter table agente_run enable row level security;
alter table agente_file_colonne enable row level security;

drop policy if exists agente_config_all_auth on agente_config;
create policy agente_config_all_auth on agente_config
  for all to authenticated using (true) with check (true);

drop policy if exists agente_run_all_auth on agente_run;
create policy agente_run_all_auth on agente_run
  for all to authenticated using (true) with check (true);

drop policy if exists agente_file_colonne_all_auth on agente_file_colonne;
create policy agente_file_colonne_all_auth on agente_file_colonne
  for all to authenticated using (true) with check (true);
```
- [ ] Verifica che il file sia ben formato (parentesi bilanciate, niente placeholder) rileggendolo:
```
npx prettier --check supabase/migrations/20260616160000_agente.sql
```
  Atteso: o "All matched files use Prettier code style!" oppure (se SQL non è coperto da prettier) un messaggio "No parser could be inferred" — in entrambi i casi nessun errore di sintassi del file da risolvere; NON modificare la SQL per prettier.
- [ ] NON eseguire la migration (la lancia l'utente sul prod). Commit:
```
git add supabase/migrations/20260616160000_agente.sql
git commit -m "feat(agente): migration agente_config/agente_run/agente_file_colonne + RLS"
```

---

### Task B4 — `POST /api/agente/tick`

Endpoint nodejs: valida chiave, heartbeat, snapshot colonne via `diffColonne`, decisione via `partiRoma`+`decideEsecuzione`, rivendicazione del giorno, ritorna istruzioni all'agente. Usa funzioni pure già definite in `lib/agente/decisione.ts` e `lib/agente/orarioRoma.ts` (Part A).

**Files**
- `app/api/agente/tick/route.ts` (nuovo)

**Dipendenze (devono esistere da Part A):** `lib/apiExportKey.ts` (B1), `lib/agente/orarioRoma.ts` (`partiRoma`), `lib/agente/decisione.ts` (`decideEsecuzione`, `diffColonne`, `RegolaMappa`).

**Step**
- [ ] Crea `app/api/agente/tick/route.ts` con questo contenuto esatto:
```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { decideEsecuzione, diffColonne, type RegolaMappa } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

type FileColonne = { nome: string; isMaster?: boolean; colonne: string[] };

type ConfigRow = {
  enabled: boolean;
  giorni: number[] | null;
  ora: string | null;
  dry_run: boolean;
  finestra_giorni: number | null;
  mappatura: RegolaMappa[] | null;
  esito_positivo: string | null;
  esito_negativo: string | null;
  ultima_rivendicazione_giorno: string | null;
};

export async function POST(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  let body: { files?: FileColonne[] } = {};
  try {
    body = (await req.json()) as { files?: FileColonne[] };
  } catch {
    body = {};
  }

  try {
    // 1) carica config singleton
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from('agente_config')
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno',
      )
      .eq('id', 1)
      .single();
    if (cfgErr || !cfg) throw cfgErr ?? new Error('Config agente assente.');
    const config = cfg as ConfigRow;

    const now = new Date();

    // 2) heartbeat
    await supabaseAdmin
      .from('agente_config')
      .update({ ultimo_contatto_il: now.toISOString() })
      .eq('id', 1);

    // 3) snapshot colonne per file (best-effort, non blocca la decisione)
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length > 0) {
      const nomi = files.map((f) => f.nome);
      const { data: prevRows } = await supabaseAdmin
        .from('agente_file_colonne')
        .select('file, colonne')
        .in('file', nomi);
      const precedentiByFile = new Map<string, string[]>();
      for (const r of (prevRows ?? []) as Array<{ file: string; colonne: string[] | null }>) {
        precedentiByFile.set(r.file, r.colonne ?? []);
      }
      const upserts = files.map((f) => {
        const precedenti = precedentiByFile.get(f.nome) ?? [];
        const nuoveColonne = Array.isArray(f.colonne) ? f.colonne : [];
        const diff = diffColonne(precedenti, nuoveColonne);
        return {
          file: f.nome,
          is_master: f.isMaster === true,
          colonne: nuoveColonne,
          colonne_nuove: diff.nuove,
          colonne_sparite: diff.sparite,
          rilevato_il: now.toISOString(),
        };
      });
      await supabaseAdmin.from('agente_file_colonne').upsert(upserts, { onConflict: 'file' });
    }

    // 4) decisione (fuso Europe/Rome)
    const parti = partiRoma(now);
    const eseguiOra = decideEsecuzione({
      enabled: config.enabled,
      giorni: config.giorni ?? [],
      ora: config.ora ?? '21:00',
      weekday: parti.weekday,
      oraCorrente: parti.oraCorrente,
      oggi: parti.oggi,
      ultimaRivendicazione: config.ultima_rivendicazione_giorno,
    });

    // 5) rivendica il giorno (un solo giro/die)
    if (eseguiOra) {
      await supabaseAdmin
        .from('agente_config')
        .update({ ultima_rivendicazione_giorno: parti.oggi })
        .eq('id', 1);
    }

    return NextResponse.json(
      {
        eseguiOra,
        dryRun: config.dry_run,
        finestraGiorni: config.finestra_giorni ?? 15,
        mappatura: config.mappatura ?? [],
        esitoPositivo: config.esito_positivo ?? 'eseguito',
        esitoNegativo: config.esito_negativo ?? 'No',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore tick.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```
- [ ] Typecheck + lint mirati:
```
npx tsc --noEmit
npx eslint app/api/agente/tick/route.ts
```
  Atteso: nessun errore sul file (se `lib/agente/decisione.ts`/`orarioRoma.ts` non sono ancora pronti il tsc segnalerà solo i moduli mancanti di Part A — non sono regressioni di questo task).
- [ ] Verifica MANUALE via curl (su dev `npm run dev` o sul deploy; richiede `LIM_MASSIVE_EXPORT_KEY` settata e migration B3 applicata). Sostituisci `<KEY>` e `<BASE>`:
```
curl -s -X POST "<BASE>/api/agente/tick" -H "x-export-key: SBAGLIATA" -H "content-type: application/json" -d "{}"
```
  Atteso: HTTP 401, body `{"error":"Chiave non valida."}`.
```
curl -s -X POST "<BASE>/api/agente/tick" -H "x-export-key: <KEY>" -H "content-type: application/json" -d "{\"files\":[{\"nome\":\"ZAGAROLO.xlsx\",\"isMaster\":true,\"colonne\":[\"ORDINE\",\"MATRICOLA\",\"esito\"]}]}"
```
  Atteso: HTTP 200, body con `eseguiOra` (true/false a seconda di giorno+ora), `dryRun`, `finestraGiorni`, `mappatura` (5 regole di default), `esitoPositivo`, `esitoNegativo`. Riesegui subito la stessa curl: se la prima ha dato `eseguiOra:true`, la seconda deve dare `eseguiOra:false` (rivendicazione del giorno). Controlla che esista la riga in `agente_file_colonne` per `ZAGAROLO.xlsx` con `colonne_nuove` = tutte le colonne al primo invio.
- [ ] Commit:
```
git add app/api/agente/tick/route.ts
git commit -m "feat(agente): POST /api/agente/tick (heartbeat + colonne + decisione)"
```

---

### Task B5 — `POST /api/agente/report`

Endpoint nodejs: valida chiave, riassume il report (`riassumiReport`), inserisce in `agente_run`, aggiorna `ultimo_giro_il`.

**Files**
- `app/api/agente/report/route.ts` (nuovo)

**Dipendenze:** `lib/apiExportKey.ts` (B1), `lib/agente/decisione.ts` (`riassumiReport`, `ReportAgente`).

**Step**
- [ ] Crea `app/api/agente/report/route.ts` con questo contenuto esatto:
```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { riassumiReport, type ReportAgente } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  let body: ReportAgente;
  try {
    body = (await req.json()) as ReportAgente;
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido.' }, { status: 400 });
  }

  try {
    const r = riassumiReport(body);
    const now = new Date();

    const { error: insErr } = await supabaseAdmin.from('agente_run').insert({
      dry_run: body.dryRun === true,
      lavori: r.lavori,
      aggiornate: r.aggiornate,
      extra: r.extra,
      conflitti: r.conflitti,
      non_collocate: r.nonCollocate,
      errore: body.erroreGlobale ?? null,
      dettaglio: body,
    });
    if (insErr) throw insErr;

    await supabaseAdmin
      .from('agente_config')
      .update({ ultimo_giro_il: now.toISOString() })
      .eq('id', 1);

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore report.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```
- [ ] Typecheck + lint mirati:
```
npx tsc --noEmit
npx eslint app/api/agente/report/route.ts
```
  Atteso: nessun errore sul file (i moduli `lib/agente/decisione.ts` di Part A devono esistere per il typecheck).
- [ ] Verifica MANUALE via curl. Sostituisci `<KEY>` e `<BASE>`:
```
curl -s -X POST "<BASE>/api/agente/report" -H "x-export-key: SBAGLIATA" -H "content-type: application/json" -d "{}"
```
  Atteso: HTTP 401, body `{"error":"Chiave non valida."}`.
```
curl -s -X POST "<BASE>/api/agente/report" -H "x-export-key: <KEY>" -H "content-type: application/json" -d "{\"lavori\":3,\"dryRun\":true,\"file\":[{\"aggiornate\":2,\"extraAggiunte\":1,\"conflitti\":[]}],\"extraNonCollocate\":[]}"
```
  Atteso: HTTP 200, body `{"ok":true}`. Poi verifica (SQL/console) che in `agente_run` ci sia una riga con `lavori=3`, `aggiornate=2`, `extra=1`, `dry_run=true`, `dettaglio` = il body inviato, e che `agente_config.ultimo_giro_il` sia stato aggiornato a ~adesso.
- [ ] Commit:
```
git add app/api/agente/report/route.ts
git commit -m "feat(agente): POST /api/agente/report (riassunto + insert agente_run)"
```

---

### Task B6 — `PUT /api/admin/agente/config`

Endpoint admin (auth di sessione): `requireAdmin()`, valida via `validaConfig`, aggiorna `agente_config`. Ritorna la config aggiornata.

**Files**
- `app/api/admin/agente/config/route.ts` (nuovo)

**Dipendenze:** `lib/apiAuth.ts` (`requireAdmin`), `lib/agente/decisione.ts` (`validaConfig`).

**Step**
- [ ] Crea `app/api/admin/agente/config/route.ts` con questo contenuto esatto:
```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { validaConfig } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido.' }, { status: 400 });
  }

  const esito = validaConfig(body);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore }, { status: 400 });
  }
  const v = esito.value;

  try {
    const { data, error } = await supabaseAdmin
      .from('agente_config')
      .update({
        enabled: v.enabled,
        giorni: v.giorni,
        ora: v.ora,
        dry_run: v.dry_run,
        finestra_giorni: v.finestra_giorni,
        mappatura: v.mappatura,
        esito_positivo: v.esito_positivo,
        esito_negativo: v.esito_negativo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultimo_giro_il, ultimo_contatto_il, ultima_rivendicazione_giorno, updated_at',
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ config: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore salvataggio config.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```
- [ ] Typecheck + lint mirati:
```
npx tsc --noEmit
npx eslint app/api/admin/agente/config/route.ts
```
  Atteso: nessun errore sul file (richiede `validaConfig` da Part A).
- [ ] Verifica MANUALE via curl. La route richiede sessione admin (cookie). Senza cookie deve dare 401; con un cookie admin valido e payload invalido 400; con payload valido 200. Esempi (sostituisci `<BASE>`):
```
curl -s -X PUT "<BASE>/api/admin/agente/config" -H "content-type: application/json" -d "{}"
```
  Atteso: HTTP 401 `{"error":"Non autenticato."}` (nessun cookie di sessione).
  Per il caso autenticato: dal browser loggato come admin apri la DevTools Console sul dominio dell'app e lancia (payload invalido → 400):
```
fetch('/api/admin/agente/config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,giorni:[1,2],ora:'21:00',dry_run:true,finestra_giorni:15,mappatura:[{campo:'INESISTENTE',colonna:'x',abilitato:true}],esito_positivo:'eseguito',esito_negativo:'No'})}).then(r=>r.status).then(console.log)
```
  Atteso: `400` (campo non in CAMPI_MAPPABILI). Poi payload valido → 200:
```
fetch('/api/admin/agente/config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:false,giorni:[1,2,3],ora:'20:30',dry_run:false,finestra_giorni:10,mappatura:[{campo:'esito',colonna:'esito',abilitato:true}],esito_positivo:'eseguito',esito_negativo:'No'})}).then(r=>r.json()).then(console.log)
```
  Atteso: HTTP 200, body `{config:{enabled:false, ora:'20:30', dry_run:false, finestra_giorni:10, ...}}`. Verifica che `agente_config` rifletta i nuovi valori.
- [ ] Commit:
```
git add app/api/admin/agente/config/route.ts
git commit -m "feat(agente): PUT /api/admin/agente/config (requireAdmin + validaConfig)"
```

---

## Note di integrazione Part B

- **Ordine di esecuzione:** B1 → B2 sono indipendenti da Part A. B4/B5/B6 importano funzioni pure di Part A (`lib/agente/decisione.ts`, `lib/agente/orarioRoma.ts`): eseguirle DOPO che Part A le ha create, altrimenti `npx tsc --noEmit` segnalerà solo i moduli mancanti (non regressioni dei file di Part B).
- **Migration B3** non va eseguita in questa sessione: la lancia l'utente sul prod. Gli endpoint B4/B5/B6 falliranno a runtime finché la migration non è applicata (tabelle assenti) — la verifica curl va fatta dopo l'applicazione.
- **Auth:** export/tick/report condividono `chiaveValida` (header `x-export-key` = `LIM_MASSIVE_EXPORT_KEY`); solo `/api/admin/agente/config` usa la sessione admin (`requireAdmin`).
- **Baseline lint/test:** repo già rossa su `npm run lint` e `npx vitest run` completo — i gate qui sono MIRATI (`npx vitest run <file>`, `npx eslint <file>`, `npx tsc --noEmit` senza NUOVI errori). Non sistemare la baseline.
- **File rilevanti (path assoluti):**
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\lib\apiExportKey.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\lib\limitazione\exportLimMassive.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\lib\limitazione\exportLimMassive.test.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\app\api\export\limitazioni-massive\route.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\supabase\migrations\20260616160000_agente.sql`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\app\api\agente\tick\route.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\app\api\agente\report\route.ts`
  - `C:\Users\Edgardo\Desktop\gestione-personale-main\app\api\admin\agente\config\route.ts`

## Part C — Agente (`tools/limitazioni-sync/*.mjs`)

> Convenzioni: ESM `.mjs` puri Node, test `.test.ts` che importano i `.mjs`. Gate per ogni Task: `npx vitest run tools/limitazioni-sync/` (verde sui file toccati — baseline repo rossa NON va sistemata) e `node --check <file.mjs>`. Giorni ISO 1=Lun..7=Dom; ora "HH:MM"; fuso Europe/Rome; exceljs colonna = index0+1.
>
> Ordine: C1 (dataCella) → C2 (colonne) → C3 (scanColonne) → C4 (apiAgente) → C5 (eseguiGiro riscritto) → C6 (main). C5 dipende da C1+C2; C6 da C3+C4+C5.

---

### Task C1 — `lib/dataCella.mjs`: `giornoDa` / `aDataExcel` / `decidiScritturaData`

**Files:**
- `tools/limitazioni-sync/lib/dataCella.mjs` (nuovo)
- `tools/limitazioni-sync/lib/dataCella.test.ts` (nuovo)

Scopo: la colonna `data` deve essere **date-aware**. Si scrive una vera data Excel (`Date` a mezzogiorno locale, niente fuso-shift), si confronta per giorno (così "data Excel" vs "2026-06-16" NON è più un falso conflitto), e `decidiScritturaData` riusa la policy "riempi vuote + segnala conflitti".

- [ ] Scrivi il test `tools/limitazioni-sync/lib/dataCella.test.ts`:

```ts
// tools/limitazioni-sync/lib/dataCella.test.ts
import { describe, it, expect } from 'vitest';
import { giornoDa, aDataExcel, decidiScritturaData } from './dataCella.mjs';

describe('giornoDa', () => {
  it('estrae YYYY-MM-DD da una stringa ISO', () => {
    expect(giornoDa('2026-06-03')).toBe('2026-06-03');
    expect(giornoDa('2026-06-03T10:00:00Z')).toBe('2026-06-03');
  });
  it('estrae YYYY-MM-DD da una Date a mezzogiorno locale (no fuso-shift)', () => {
    expect(giornoDa(new Date(2026, 5, 3, 12, 0, 0))).toBe('2026-06-03');
  });
  it('vuoto/null/invalido → stringa vuota', () => {
    expect(giornoDa('')).toBe('');
    expect(giornoDa(null)).toBe('');
    expect(giornoDa('non-una-data')).toBe('');
  });
});

describe('aDataExcel', () => {
  it('iso → Date a mezzogiorno locale', () => {
    const d = aDataExcel('2026-06-03');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);   // giugno = 5
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(12);
  });
  it('round-trip: giornoDa(aDataExcel(iso)) === iso', () => {
    expect(giornoDa(aDataExcel('2026-06-16'))).toBe('2026-06-16');
    expect(giornoDa(aDataExcel('2025-01-01'))).toBe('2025-01-01');
  });
  it('iso vuoto/invalido → null', () => {
    expect(aDataExcel('')).toBeNull();
    expect(aDataExcel('non-una-data')).toBeNull();
  });
});

describe('decidiScritturaData', () => {
  it('cella vuota → scrivi una Date Excel', () => {
    const d = decidiScritturaData(null, '2026-06-03');
    expect(d.azione).toBe('scrivi');
    expect(d.valore).toBeInstanceOf(Date);
    expect(giornoDa(d.valore)).toBe('2026-06-03');
  });
  it('nuovo iso vuoto → salta', () => {
    expect(decidiScritturaData(new Date(2026, 5, 3, 12), '')).toEqual({ azione: 'salta', valore: null });
  });
  it('stesso giorno (Date Excel già presente) → salta (niente falso conflitto)', () => {
    const esistente = aDataExcel('2026-06-03');
    expect(decidiScritturaData(esistente, '2026-06-03')).toEqual({ azione: 'salta', valore: null });
  });
  it('stesso giorno (stringa già presente) → salta', () => {
    expect(decidiScritturaData('2026-06-03', '2026-06-03')).toEqual({ azione: 'salta', valore: null });
  });
  it('giorno diverso → conflitto (esistente per giorno)', () => {
    const d = decidiScritturaData(aDataExcel('2026-06-01'), '2026-06-03');
    expect(d.azione).toBe('conflitto');
    expect(d.esistente).toBe('2026-06-01');
    expect(giornoDa(d.valore)).toBe('2026-06-03');
  });
});
```

- [ ] Verifica che fallisce (modulo assente): `npx vitest run tools/limitazioni-sync/lib/dataCella.test.ts` → output atteso `Failed to resolve import "./dataCella.mjs"` (oppure suite rossa).

- [ ] Crea `tools/limitazioni-sync/lib/dataCella.mjs`:

```js
// tools/limitazioni-sync/lib/dataCella.mjs
// PURE: gestione date-aware della colonna "data" del file ACEA.
// Si scrive una vera data Excel (Date a mezzogiorno locale, niente fuso-shift) e si
// confronta per GIORNO, così "data Excel" vs "2026-06-16" non genera falsi conflitti.

/** Estrae 'YYYY-MM-DD' (giorno locale) da Date | stringa ISO | numero; '' se vuoto/invalido. */
export function giornoDa(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' → Date a mezzogiorno locale (evita lo slittamento di giorno per fuso); null se invalido. */
export function aDataExcel(iso) {
  const g = giornoDa(iso);
  if (!g) return null;
  const [y, m, d] = g.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Policy "riempi vuote + segnala conflitti", ma confrontando per GIORNO.
 *  Ritorna { azione: 'scrivi'|'salta'|'conflitto', valore: Date|null, esistente? }. */
export function decidiScritturaData(cellaEsistente, nuovoIso) {
  const nuovoG = giornoDa(nuovoIso);
  if (nuovoG === '') return { azione: 'salta', valore: null };
  const esistenteG = giornoDa(cellaEsistente);
  if (esistenteG === '') return { azione: 'scrivi', valore: aDataExcel(nuovoG) };
  if (esistenteG === nuovoG) return { azione: 'salta', valore: null };
  return { azione: 'conflitto', valore: aDataExcel(nuovoG), esistente: esistenteG };
}
```

- [ ] Verifica verde: `npx vitest run tools/limitazioni-sync/lib/dataCella.test.ts` → `Test Files  1 passed` / tutti gli `it` verdi.
- [ ] `node --check tools/limitazioni-sync/lib/dataCella.mjs` → nessun output, exit 0.
- [ ] **Commit:** `test(lim-sync): dataCella date-aware (giornoDa/aDataExcel/decidiScritturaData)`

---

### Task C2 — `lib/colonne.mjs`: esporta `normNome`, aggiungi `risolviColonna`, `isFileMaster` solo odl+matricola

**Files:**
- `tools/limitazioni-sync/lib/colonne.mjs` (modifica)
- `tools/limitazioni-sync/lib/colonne.test.ts` (modifica)

Scopo: la `norm` per-nome deve essere robusta (NFD/accenti, NBSP, doppi spazi) e **condivisa** tra scan e scrittura; aggiungere `risolviColonna(headers, nome)` che restituisce l'indice 0-based del primo match per `normNome`; alleggerire la firma-master a **solo ODL+MATRICOLA** (esito/sigillo ora sono mappabili).

- [ ] Aggiorna `tools/limitazioni-sync/lib/colonne.test.ts` (aggiungi import + nuove suite + correggi `isFileMaster`):

old:
```ts
import { rilevaColonne, isFileMaster, colonnaMarker } from './colonne.mjs';
```
new:
```ts
import { rilevaColonne, isFileMaster, colonnaMarker, normNome, risolviColonna } from './colonne.mjs';
```

old:
```ts
describe('isFileMaster', () => {
  it('true se ha la firma minima (odl, matricola, esito, sigillo)', () => {
    expect(isFileMaster(headerAcea())).toBe(true);
  });
  it('false su un file estraneo', () => {
    expect(isFileMaster(['Data', 'Operatore', 'Note'])).toBe(false);
  });
});
```
new:
```ts
describe('isFileMaster', () => {
  it('true se ha SOLO odl+matricola (ORDINE+MATRICOLA)', () => {
    expect(isFileMaster(headerAcea())).toBe(true);
  });
  it('true anche senza esito/sigillo (ora mappabili)', () => {
    expect(isFileMaster(['ORDINE', 'MATRICOLA'])).toBe(true);
  });
  it('false se manca matricola', () => {
    expect(isFileMaster(['ORDINE', 'INDIRIZZO'])).toBe(false);
  });
  it('false su un file estraneo', () => {
    expect(isFileMaster(['Data', 'Operatore', 'Note'])).toBe(false);
  });
});

describe('normNome', () => {
  it('uniforma maiuscole, accenti (NFD), NBSP e doppi spazi', () => {
    expect(normNome('Località')).toBe(normNome('LOCALITA'));
    expect(normNome('data prevista')).toBe('data prevista'); // NBSP → spazio
    expect(normNome('  Sigillo   Posato  ')).toBe('sigillo posato'); // collapse + trim
  });
  it('null/undefined → stringa vuota', () => {
    expect(normNome(null)).toBe('');
    expect(normNome(undefined)).toBe('');
  });
});

describe('risolviColonna', () => {
  const headers = ['ORDINE', 'MATRICOLA', 'Località', 'Esecutore', 'esito'];
  it('trova per normNome (case/accento-insensitive) → index0', () => {
    expect(risolviColonna(headers, 'esecutore')).toBe(3);
    expect(risolviColonna(headers, 'LOCALITÀ')).toBe(2);
  });
  it('nome assente → -1', () => {
    expect(risolviColonna(headers, 'sigillo posato')).toBe(-1);
  });
  it('intestazioni duplicate → vince la prima', () => {
    expect(risolviColonna(['esito', 'X', 'esito'], 'esito')).toBe(0);
  });
});
```

- [ ] Verifica che fallisce: `npx vitest run tools/limitazioni-sync/lib/colonne.test.ts` → rosso (import mancanti `normNome`/`risolviColonna` + nuovi casi `isFileMaster`).

- [ ] Modifica `tools/limitazioni-sync/lib/colonne.mjs`:

old:
```js
const norm = (s) => String(s ?? '').trim().toLowerCase();
```
new:
```js
/** Norma robusta per nome-colonna: NFD (toglie accenti), NBSP→spazio, collapse spazi, trim, lowercase.
 *  Stessa funzione per lo scan dei menu e per la scrittura guidata dalla mappa. */
export function normNome(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const norm = normNome;
```

old:
```js
/** Un file è "master limitazioni" solo se ha la firma minima di colonne. */
export function isFileMaster(headerRow) {
  const c = rilevaColonne(headerRow);
  return ['odl', 'matricola', 'esito', 'sigillo'].every((k) => k in c);
}
```
new:
```js
/** Un file è "master limitazioni" se ha SOLO ORDINE+MATRICOLA
 *  (esito/sigillo ora sono campi mappabili → non più nella firma). */
export function isFileMaster(headerRow) {
  const c = rilevaColonne(headerRow);
  return ['odl', 'matricola'].every((k) => k in c);
}

/** Indice 0-based della colonna con intestazione = `nome` (per normNome, primo match); -1 se assente. */
export function risolviColonna(headers, nome) {
  const target = normNome(nome);
  if (!target) return -1;
  const cells = (headers ?? []).map(normNome);
  return cells.indexOf(target);
}
```

- [ ] Verifica verde: `npx vitest run tools/limitazioni-sync/lib/colonne.test.ts` → tutte le suite verdi (incl. `rilevaColonne` e `colonnaMarker` invariati, che usano ancora `norm` ora aliasato a `normNome`).
- [ ] `node --check tools/limitazioni-sync/lib/colonne.mjs` → exit 0.
- [ ] **Commit:** `feat(lim-sync): normNome robusto + risolviColonna; isFileMaster solo odl+matricola`

---

### Task C3 — `lib/scanColonne.mjs`: intestazioni dei file master della cartella

**Files:**
- `tools/limitazioni-sync/lib/scanColonne.mjs` (nuovo)
- `tools/limitazioni-sync/lib/scanColonne.test.ts` (nuovo)

Scopo: leggere le **intestazioni grezze** dei file master (`[{ nome, isMaster, colonne }]`) per popolare i menu della mappa nell'app. Stessa selezione file di `eseguiGiro` (`.xlsx`, no `~$`, no `_backup`/`_log`); `try/catch` per-file che non blocca mai gli altri.

- [ ] Scrivi `tools/limitazioni-sync/lib/scanColonne.test.ts`:

```ts
// tools/limitazioni-sync/lib/scanColonne.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { scanColonne } from './scanColonne.mjs';

async function creaMaster(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';
  h.getCell(9).value = 'MATRICOLA';
  h.getCell(65).value = 'Esecutore';
  h.getCell(67).value = 'esito';
  await wb.xlsx.writeFile(file);
}

async function creaEstraneo(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(1).value = 'Data';
  h.getCell(2).value = 'Note';
  await wb.xlsx.writeFile(file);
}

describe('scanColonne', () => {
  it('ritorna le intestazioni grezze dei file master e marca isMaster', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-scan-'));
    await creaMaster(path.join(dir, 'ZAGAROLO.xlsx'));
    await creaEstraneo(path.join(dir, 'ALTRO.xlsx'));

    const out = scanColonne(dir);
    const zaga = out.find((f) => f.nome === 'ZAGAROLO.xlsx');
    expect(zaga).toBeTruthy();
    expect(zaga!.isMaster).toBe(true);
    expect(zaga!.colonne).toContain('ORDINE');
    expect(zaga!.colonne).toContain('MATRICOLA');
    expect(zaga!.colonne).toContain('esito');

    const altro = out.find((f) => f.nome === 'ALTRO.xlsx');
    expect(altro!.isMaster).toBe(false);
  });

  it('ignora ~$ e cartelle _backup/_log; cartella assente → []', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-scan2-'));
    await creaMaster(path.join(dir, 'ZAGAROLO.xlsx'));
    fs.writeFileSync(path.join(dir, '~$ZAGAROLO.xlsx'), 'lock');
    fs.mkdirSync(path.join(dir, '_backup'));
    await creaMaster(path.join(dir, '_backup', 'OLD.xlsx'));
    fs.mkdirSync(path.join(dir, '_log'));

    const out = scanColonne(dir);
    expect(out.map((f) => f.nome)).toEqual(['ZAGAROLO.xlsx']);

    expect(scanColonne(path.join(dir, 'non-esiste'))).toEqual([]);
  });
});
```

- [ ] Verifica che fallisce: `npx vitest run tools/limitazioni-sync/lib/scanColonne.test.ts` → import non risolto / rosso.

- [ ] Crea `tools/limitazioni-sync/lib/scanColonne.mjs`:

```js
// tools/limitazioni-sync/lib/scanColonne.mjs
// Legge le intestazioni grezze dei file della cartella → [{ nome, isMaster, colonne }].
// Stessa selezione file di eseguiGiro; try/catch per-file (un file rotto non blocca gli altri).
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { trovaRigaIntestazione } from './excelIO.mjs';
import { isFileMaster } from './colonne.mjs';

/** Intestazioni grezze (stringhe) della riga `r1` 1-based di un worksheet. */
function intestazioniGrezze(ws, r1) {
  const valori = ws.getRow(r1).values;
  const arr = Array.isArray(valori) ? valori.slice(1) : [];
  return arr.map((v) => (v == null ? '' : String(v)));
}

/** Restituisce, per ogni file selezionabile della cartella, { nome, isMaster, colonne[] }. */
export function scanColonne(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  let nomi;
  try {
    nomi = fs.readdirSync(cartella);
  } catch {
    return [];
  }
  const selezionati = nomi.filter(
    (f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'),
  );
  const out = [];
  for (const nome of selezionati) {
    const file = path.join(cartella, nome);
    try {
      // i sottocartelle _backup/_log non finiscono qui: readdir è non-ricorsivo,
      // e i file dentro non sono raggiunti. Doppia guardia su file di tipo non regolare:
      if (!fs.statSync(file).isFile()) continue;
      const wb = new ExcelJS.Workbook();
      // carico sincrono via buffer per restare pura/serializzabile col resto dello scan
      const buf = fs.readFileSync(file);
      // exceljs richiede async per il parsing → si usa la stessa caricaWorkbook altrove,
      // ma qui basta una lettura best-effort; se fallisce, il file è marcato non-master.
      void buf;
      void wb;
    } catch {
      out.push({ nome, isMaster: false, colonne: [] });
    }
  }
  return out;
}
```

> Nota implementativa: `ExcelJS` parse è asincrono. Per restare coerenti con `caricaWorkbook` (async) ma esporre una API sincrona testabile, l'implementazione reale sotto usa `async` internamente. **Sostituisci** il corpo placeholder qui sopra con la versione async definitiva del prossimo step (questo step intermedio è solo per chiarire la selezione file). Procedi direttamente con la versione finale:

- [ ] Sovrascrivi `tools/limitazioni-sync/lib/scanColonne.mjs` con la versione finale (async, `scanColonne` ritorna una Promise — aggiorna l'await nel test):

```js
// tools/limitazioni-sync/lib/scanColonne.mjs
// Legge le intestazioni grezze dei file della cartella → [{ nome, isMaster, colonne }].
// Stessa selezione file di eseguiGiro; try/catch per-file (un file rotto non blocca gli altri).
import fs from 'node:fs';
import path from 'node:path';
import { caricaWorkbook, trovaRigaIntestazione } from './excelIO.mjs';
import { isFileMaster } from './colonne.mjs';

/** Intestazioni grezze (stringhe) della riga `r1` 1-based di un worksheet. */
function intestazioniGrezze(ws, r1) {
  const valori = ws.getRow(r1).values;
  const arr = Array.isArray(valori) ? valori.slice(1) : [];
  return arr.map((v) => (v == null ? '' : String(v)));
}

/** [{ nome, isMaster, colonne[] }] per i file *.xlsx selezionabili della cartella. */
export async function scanColonne(cartella) {
  if (!cartella || !fs.existsSync(cartella)) return [];
  let voci;
  try {
    voci = fs.readdirSync(cartella, { withFileTypes: true });
  } catch {
    return [];
  }
  const nomi = voci
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.xlsx') && !d.name.startsWith('~$'))
    .map((d) => d.name);

  const out = [];
  for (const nome of nomi) {
    const file = path.join(cartella, nome);
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) {
        out.push({ nome, isMaster: false, colonne: [] });
        continue;
      }
      const colonne = intestazioniGrezze(ws, rIntest);
      out.push({ nome, isMaster: isFileMaster(colonne), colonne });
    } catch {
      out.push({ nome, isMaster: false, colonne: [] });
    }
  }
  return out;
}
```

- [ ] Aggiorna il test per l'API async (`scanColonne` ora ritorna Promise):

old (entrambe le occorrenze):
```ts
    const out = scanColonne(dir);
```
new:
```ts
    const out = await scanColonne(dir);
```

e l'ultima riga del 2° test:

old:
```ts
    expect(scanColonne(path.join(dir, 'non-esiste'))).toEqual([]);
```
new:
```ts
    expect(await scanColonne(path.join(dir, 'non-esiste'))).toEqual([]);
```

> I file dentro `_backup`/`_log` sono esclusi perché `readdirSync` è non-ricorsivo e `d.isFile()` scarta le sottocartelle: un `OLD.xlsx` dentro `_backup` non viene mai raggiunto. Il test lo verifica già.

- [ ] Verifica verde: `npx vitest run tools/limitazioni-sync/lib/scanColonne.test.ts` → 2 `it` verdi.
- [ ] `node --check tools/limitazioni-sync/lib/scanColonne.mjs` → exit 0.
- [ ] **Commit:** `feat(lim-sync): scanColonne legge le intestazioni dei file master`

---

### Task C4 — `lib/apiAgente.mjs`: `tick` / `inviaReport` / `baseUrlDaEndpoint`

**Files:**
- `tools/limitazioni-sync/lib/apiAgente.mjs` (nuovo)
- `tools/limitazioni-sync/lib/apiAgente.test.ts` (nuovo)

Scopo: client HTTP dell'agente verso l'app. `baseUrlDaEndpoint` deriva la base (`https://host`) dall'`endpointUrl` dell'export. `tick` POSTa `/api/agente/tick` con `{ files }` e l'header chiave; `inviaReport` POSTa `/api/agente/report` con il report. `fetchImpl` iniettabile per i test (come in `fetchLavori.mjs`).

- [ ] Scrivi `tools/limitazioni-sync/lib/apiAgente.test.ts`:

```ts
// tools/limitazioni-sync/lib/apiAgente.test.ts
import { describe, it, expect, vi } from 'vitest';
import { baseUrlDaEndpoint, tick, inviaReport } from './apiAgente.mjs';

describe('baseUrlDaEndpoint', () => {
  it('estrae origin da un endpoint completo', () => {
    expect(baseUrlDaEndpoint('https://app.vercel.app/api/export/limitazioni-massive'))
      .toBe('https://app.vercel.app');
  });
  it('regge porta e localhost', () => {
    expect(baseUrlDaEndpoint('http://localhost:3000/api/export/x')).toBe('http://localhost:3000');
  });
});

describe('tick', () => {
  it('POST /api/agente/tick con header chiave e body { files }', async () => {
    const files = [{ nome: 'ZAGAROLO.xlsx', isMaster: true, colonne: ['ORDINE'] }];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ eseguiOra: true, dryRun: false, finestraGiorni: 15, mappatura: [], esitoPositivo: 'eseguito', esitoNegativo: 'No' }),
    }));
    const out = await tick({ baseUrl: 'https://app.vercel.app', exportKey: 'K', files }, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/agente/tick');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ files });
    expect(out.eseguiOra).toBe(true);
  });

  it('risposta non ok → throw con status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'no' }));
    await expect(tick({ baseUrl: 'https://x', exportKey: 'K', files: [] }, fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});

describe('inviaReport', () => {
  it('POST /api/agente/report con il report nel body', async () => {
    const report = { dryRun: true, file: [], extraNonCollocate: [] };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    const out = await inviaReport({ baseUrl: 'https://app.vercel.app', exportKey: 'K', report }, fetchImpl as unknown as typeof fetch);

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://app.vercel.app/api/agente/report');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-export-key']).toBe('K');
    expect(JSON.parse(opts.body)).toEqual(report);
    expect(out).toEqual({ ok: true });
  });
});
```

- [ ] Verifica che fallisce: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts` → rosso (import mancanti).

- [ ] Crea `tools/limitazioni-sync/lib/apiAgente.mjs`:

```js
// tools/limitazioni-sync/lib/apiAgente.mjs
// I/O: client HTTP dell'agente verso l'app (tick + report). `fetchImpl` iniettabile per i test.

/** Origin (schema+host[:porta]) dell'endpoint export → base per le route agente. */
export function baseUrlDaEndpoint(url) {
  return new URL(url).origin;
}

async function postJson(url, exportKey, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-export-key': exportKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`POST ${url} ${res.status}: ${corpo}`);
  }
  return res.json();
}

/** POST /api/agente/tick con le colonne rilevate → { eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo }. */
export function tick({ baseUrl, exportKey, files }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/tick`, exportKey, { files }, fetchImpl);
}

/** POST /api/agente/report con il report del giro → { ok: true }. */
export function inviaReport({ baseUrl, exportKey, report }, fetchImpl = fetch) {
  return postJson(`${baseUrl}/api/agente/report`, exportKey, report, fetchImpl);
}
```

- [ ] Verifica verde: `npx vitest run tools/limitazioni-sync/lib/apiAgente.test.ts` → tutti gli `it` verdi.
- [ ] `node --check tools/limitazioni-sync/lib/apiAgente.mjs` → exit 0.
- [ ] **Commit:** `feat(lim-sync): apiAgente tick/inviaReport + baseUrlDaEndpoint`

---

### Task C5 — Riscrittura di `eseguiGiro` guidata dalla mappatura

**Files:**
- `tools/limitazioni-sync/agente.mjs` (modifica — riscrive `eseguiGiro`)
- `tools/limitazioni-sync/agente.test.ts` (modifica)

Scopo: `eseguiGiro` non usa più i campi fissi. Riceve `mappatura` (`[{campo,colonna,auto?,abilitato}]`), `esitoPositivo`, `esitoNegativo`. Per ogni file master (`isFileMaster`=odl+matricola), per ogni riga **e per ogni regola abilitata**:
- `idx = risolviColonna(header, regola.colonna)`; se `idx < 0` → **salta + segnala** (colonna assente, una volta per file).
- valore: `esito` → `(esitoOk===true?esitoPositivo:esitoOk===false?esitoNegativo:null)` (null = non scrive); `data` → date-aware (`decidiScritturaData`, scrive `aDataExcel`); altri campi → valore dal lavoro via `decidiScrittura`.
- `marcatore` → **solo righe extra**, **solo cella vuota**, colonna: `regola.auto ? colonnaMarker(header) : risolviColonna(header, regola.colonna)`.
- Stessa logica/date-aware su pianificate **ED** extra. Le chiavi di aggancio (`odl`/`matricola`/`comune`) restano auto-rilevate via `rilevaColonne`.

> La nuova firma è `eseguiGiro({ cartella, lavori, dryRun, stamp, mappatura, esitoPositivo, esitoNegativo })`. Il `MARKER` esportato resta (fallback testo marcatore di default).

- [ ] Riscrivi `tools/limitazioni-sync/agente.test.ts` (passa la `mappatura` esplicita; verifica testi-esito da `esitoOk`, marcatore solo extra, colonna assente segnalata, data come vera Date):

```ts
// tools/limitazioni-sync/agente.test.ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eseguiGiro, MARKER } from './agente.mjs';
import { giornoDa } from './lib/dataCella.mjs';

// crea ZAGAROLO.xlsx con intestazione ACEA (riga 1) + 2 righe pianificate
async function creaFile(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Foglio1');
  const h = ws.getRow(1);
  h.getCell(6).value = 'ORDINE';        // F  odl
  h.getCell(9).value = 'MATRICOLA';     // I  matricola
  h.getCell(58).value = 'INDIRIZZO';    // BF via
  h.getCell(64).value = 'Località';     // BL comune
  h.getCell(65).value = 'Esecutore';    // BM
  h.getCell(66).value = 'data prevista';// BN
  h.getCell(67).value = 'esito';        // BO
  h.getCell(69).value = 'sigillo posato';// BQ
  h.getCell(70).value = 'stato odl';    // BR
  const r2 = ws.getRow(2);
  r2.getCell(6).value = '912231020'; r2.getCell(9).value = '20000020750'; r2.getCell(64).value = 'ZAGAROLO';
  const r3 = ws.getRow(3);
  r3.getCell(6).value = '999999999'; r3.getCell(9).value = '11111111111'; r3.getCell(64).value = 'ZAGAROLO';
  await wb.xlsx.writeFile(file);
}

// mappa di default per i test: i 4 campi classici (per nome) + marcatore auto.
const MAPPATURA = [
  { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
  { campo: 'data', colonna: 'data prevista', abilitato: true },
  { campo: 'esito', colonna: 'esito', abilitato: true },
  { campo: 'sigillo', colonna: 'sigillo posato', abilitato: true },
  { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
];

function giro(dir: string) {
  return eseguiGiro({
    cartella: dir,
    lavori: [
      { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
        esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
        sigillo: 'AA728566', manuale: false },
      { id: 'b', odl: '', matricola: '202315612361', comune: 'ZAGAROLO', via: 'VIA Y 2',
        esecutore: 'PASTORELLI', data_esecuzione: '2026-06-04', esito: 'No', esitoOk: false,
        sigillo: '', manuale: true },
    ],
    dryRun: false,
    stamp: '20260616-2100',
    mappatura: MAPPATURA,
    esitoPositivo: 'eseguito',
    esitoNegativo: 'No',
  });
}

describe('eseguiGiro (guidato dalla mappatura)', () => {
  it('scrive per nome-colonna, applica i testi esito da esitoOk, data come vera Date, marcatore solo sugli extra', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-e2e-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const report = await giro(dir);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    // riga 2 compilata
    expect(ws.getRow(2).getCell(65).value).toBe('CIARALLO');          // BM esecutore
    expect(giornoDa(ws.getRow(2).getCell(66).value)).toBe('2026-06-03'); // BN data → vera Date
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');          // BO esito = esitoPositivo (esitoOk=true)
    expect(ws.getRow(2).getCell(69).value).toBe('AA728566');          // BQ sigillo
    // riga 3 NON lavorata → resta vuota
    expect(ws.getRow(3).getCell(67).value ?? '').toBe('');
    // extra (id b): esito = esitoNegativo (esitoOk=false) + marcatore in coda
    const ultima = ws.getRow(ws.rowCount);
    expect(ultima.getCell(9).value).toBe('202315612361');
    expect(ultima.getCell(67).value).toBe('No');
    expect(ultima.getCell(71).value).toBe(MARKER);                    // BS marker (auto, prima vuota dopo le note)
    // marcatore SOLO sugli extra: la riga 2 pianificata non ha il marcatore
    expect(ws.getRow(2).getCell(71).value ?? '').toBe('');
    // report coerente
    expect(report.file[0].aggiornate).toBe(1);
    expect(report.file[0].extraAggiunte).toBe(1);
    expect(fs.existsSync(path.join(dir, '_backup', 'ZAGAROLO__20260616-2100.xlsx'))).toBe(true);
  });

  it('regola con colonna assente → salta e la segnala nel report (mai scrive in coda)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-miss-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    const report = await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: false },
      ],
      dryRun: false,
      stamp: '20260616-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
        { campo: 'pdr', colonna: 'PDR INESISTENTE', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    expect(report.file[0].colonneAssenti).toContain('PDR INESISTENTE');
    // l'esecutore (colonna presente) è stato scritto
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    expect(wb.worksheets[0].getRow(2).getCell(65).value).toBe('CIARALLO');
  });

  it('regola disabilitata → non scrive quel campo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'limsync-off-'));
    const file = path.join(dir, 'ZAGAROLO.xlsx');
    await creaFile(file);

    await eseguiGiro({
      cartella: dir,
      lavori: [
        { id: 'a', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO', via: 'VIA X 1',
          esecutore: 'CIARALLO', data_esecuzione: '2026-06-03', esito: 'eseguito', esitoOk: true,
          sigillo: 'AA728566', manuale: false },
      ],
      dryRun: false,
      stamp: '20260616-2100',
      mappatura: [
        { campo: 'esecutore', colonna: 'Esecutore', abilitato: false },
        { campo: 'esito', colonna: 'esito', abilitato: true },
      ],
      esitoPositivo: 'eseguito',
      esitoNegativo: 'No',
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(65).value ?? '').toBe('');     // esecutore OFF → vuoto
    expect(ws.getRow(2).getCell(67).value).toBe('eseguito');   // esito ON → scritto
  });
});
```

- [ ] Verifica che fallisce: `npx vitest run tools/limitazioni-sync/agente.test.ts` → rosso (la vecchia `eseguiGiro` ignora `mappatura`/`esitoOk`/`colonneAssenti`).

- [ ] Modifica `tools/limitazioni-sync/agente.mjs` — import:

old:
```js
import { rilevaColonne, colonnaMarker } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { decidiScrittura } from './lib/scrittura.mjs';
```
new:
```js
import { rilevaColonne, colonnaMarker, risolviColonna } from './lib/colonne.mjs';
import { buildIndice, agganciaRiga, norm, trovaExtra } from './lib/match.mjs';
import { decidiScrittura } from './lib/scrittura.mjs';
import { decidiScritturaData } from './lib/dataCella.mjs';
```

- [ ] Sostituisci l'intero corpo di `eseguiGiro` (dalla firma fino al `return report;` finale).

old:
```js
export async function eseguiGiro({ cartella, lavori, dryRun, stamp }) {
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [] };
  const indice = buildIndice(lavori);
  const idConsumati = new Set();
  const comuniConFile = new Set();

  if (!fs.existsSync(cartella)) {
    report.erroreGlobale = `Cartella non trovata: ${cartella}`;
    return report;
  }

  const files = fs
    .readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));

  for (const file of files) {
    const fileReport = {
      file: path.basename(file), master: false, aggiornate: 0, extraAggiunte: 0,
      conflitti: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) { report.file.push(fileReport); continue; } // non master → ignora
      fileReport.master = true;

      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header);
      const comuneFile =
        (col.comune != null ? comunePrevalente(ws, rIntest, col.comune) : '') ||
        norm(path.basename(file, '.xlsx'));
      comuniConFile.add(comuneFile);

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);
        const campi = [
          ['esecutore', hit.lavoro.esecutore],
          ['data', hit.lavoro.data_esecuzione],
          ['esito', hit.lavoro.esito],
          ['sigillo', hit.lavoro.sigillo],
        ];
        let toccata = false;
        for (const [chiave, valore] of campi) {
          if (col[chiave] == null) continue;
          const cell = row.getCell(col[chiave] + 1);
          const d = decidiScrittura(cell.value, valore);
          if (d.azione === 'scrivi') { cell.value = d.valore; toccata = true; }
          else if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: r, campo: chiave, esistente: d.esistente, nuovo: d.valore });
          }
        }
        if (toccata) fileReport.aggiornate++;
      }

      // 2) extra di questo comune
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      if (extraComune.length) {
        const markerCol = colonnaMarker(header);
        for (const l of extraComune) {
          idConsumati.add(l.id);
          const row = ws.addRow([]);
          const set = (c, v) => { if (c != null && v) row.getCell(c + 1).value = v; };
          set(col.matricola, l.matricola);
          set(col.via, l.via);
          set(col.esecutore, l.esecutore);
          set(col.data, l.data_esecuzione);
          set(col.esito, l.esito);
          set(col.sigillo, l.sigillo);
          row.getCell(markerCol + 1).value = MARKER;
          fileReport.extraAggiunte++;
        }
      }

      if (!dryRun && (fileReport.aggiornate > 0 || fileReport.extraAggiunte > 0)) {
        backupFile(file, stamp);
        await salva(wb, file);
      }
    } catch (e) {
      fileReport.saltato = true;
      fileReport.errore = e instanceof Error ? e.message : String(e);
    }
    report.file.push(fileReport);
  }

  // extra di comuni senza file
  report.extraNonCollocate = trovaExtra(lavori, idConsumati)
    .filter((l) => !comuniConFile.has(norm(l.comune)))
    .map((l) => ({ id: l.id, comune: l.comune, matricola: l.matricola, esecutore: l.esecutore }));

  return report;
}
```
new:
```js
/** Valore testuale dell'esito da scrivere, da esitoOk (true→positivo, false→negativo, null→non scrive). */
function valoreEsito(l, esitoPositivo, esitoNegativo) {
  if (l.esitoOk === true) return esitoPositivo;
  if (l.esitoOk === false) return esitoNegativo;
  return null; // non lavorato → non scrive
}

/** Valore (non-esito, non-data) del campo mappato dal lavoro. */
function valoreCampo(l, campo) {
  switch (campo) {
    case 'esecutore': return l.esecutore;
    case 'sigillo': return l.sigillo;
    case 'matricola': return l.matricola;
    case 'via': return l.via;
    case 'pdr': return l.pdr;
    case 'nominativo': return l.nominativo;
    case 'comune': return l.comune;
    default: return null;
  }
}

export async function eseguiGiro({
  cartella, lavori, dryRun, stamp, mappatura, esitoPositivo, esitoNegativo,
}) {
  const report = { generatoIl: stamp, dryRun: !!dryRun, file: [], extraNonCollocate: [] };
  const regole = (mappatura ?? []).filter((m) => m && m.abilitato);
  const indice = buildIndice(lavori);
  const idConsumati = new Set();
  const comuniConFile = new Set();

  if (!fs.existsSync(cartella)) {
    report.erroreGlobale = `Cartella non trovata: ${cartella}`;
    return report;
  }

  const files = fs
    .readdirSync(cartella)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(cartella, f));

  for (const file of files) {
    const fileReport = {
      file: path.basename(file), master: false, aggiornate: 0, extraAggiunte: 0,
      conflitti: [], colonneAssenti: [], saltato: false, errore: null,
    };
    try {
      const wb = await caricaWorkbook(file);
      const ws = wb.worksheets[0];
      const rIntest = trovaRigaIntestazione(ws);
      if (rIntest < 0) { report.file.push(fileReport); continue; } // non master → ignora
      fileReport.master = true;

      const header = (ws.getRow(rIntest).values || []).slice(1);
      const col = rilevaColonne(header); // SOLO aggancio (odl/matricola/comune/via)

      // risolvi una volta per file le colonne mappate (esclusa la regola marcatore).
      const colonneAssenti = new Set();
      const regoleScrittura = []; // { campo, idx }
      let regolaMarcatore = null;
      for (const regola of regole) {
        if (regola.campo === 'marcatore') { regolaMarcatore = regola; continue; }
        const idx = risolviColonna(header, regola.colonna);
        if (idx < 0) { colonneAssenti.add(regola.colonna); continue; }
        regoleScrittura.push({ campo: regola.campo, idx });
      }
      fileReport.colonneAssenti = [...colonneAssenti];

      // indice della colonna marcatore (solo per le righe extra).
      let markerCol = -1;
      let markerTesto = MARKER;
      if (regolaMarcatore) {
        if (regolaMarcatore.auto) markerCol = colonnaMarker(header);
        else {
          markerCol = risolviColonna(header, regolaMarcatore.colonna);
          if (markerCol < 0) { colonneAssenti.add(regolaMarcatore.colonna); fileReport.colonneAssenti = [...colonneAssenti]; }
        }
      }

      const comuneFile =
        (col.comune != null ? comunePrevalente(ws, rIntest, col.comune) : '') ||
        norm(path.basename(file, '.xlsx'));
      comuniConFile.add(comuneFile);

      // scrive una cella mappata di una riga (pianificata o extra). Ritorna true se ha toccato.
      const scriviCella = (row, regola, l) => {
        const cell = row.getCell(regola.idx + 1);
        if (regola.campo === 'data') {
          const d = decidiScritturaData(cell.value, l.data_esecuzione);
          if (d.azione === 'scrivi') { cell.value = d.valore; return true; }
          if (d.azione === 'conflitto') {
            fileReport.conflitti.push({ riga: row.number, campo: 'data', esistente: d.esistente, nuovo: l.data_esecuzione });
          }
          return false;
        }
        const valore = regola.campo === 'esito'
          ? valoreEsito(l, esitoPositivo, esitoNegativo)
          : valoreCampo(l, regola.campo);
        const d = decidiScrittura(cell.value, valore);
        if (d.azione === 'scrivi') { cell.value = d.valore; return true; }
        if (d.azione === 'conflitto') {
          fileReport.conflitti.push({ riga: row.number, campo: regola.campo, esistente: d.esistente, nuovo: d.valore });
        }
        return false;
      };

      // 1) righe pianificate
      for (let r = rIntest + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const odl = col.odl != null ? row.getCell(col.odl + 1).value : null;
        const matricola = col.matricola != null ? row.getCell(col.matricola + 1).value : null;
        if (!odl && !matricola) continue;
        const hit = agganciaRiga({ odl, matricola }, indice, comuneFile);
        if (!hit) continue;
        idConsumati.add(hit.lavoro.id);
        let toccata = false;
        for (const regola of regoleScrittura) {
          if (scriviCella(row, regola, hit.lavoro)) toccata = true;
        }
        if (toccata) fileReport.aggiornate++;
      }

      // 2) extra di questo comune (stessa logica/date-aware delle pianificate)
      const extraComune = trovaExtra(lavori, idConsumati).filter((l) => norm(l.comune) === comuneFile);
      for (const l of extraComune) {
        idConsumati.add(l.id);
        const row = ws.addRow([]);
        for (const regola of regoleScrittura) scriviCella(row, regola, l);
        // marcatore: solo extra, solo cella vuota.
        if (markerCol >= 0) {
          const mc = row.getCell(markerCol + 1);
          const d = decidiScrittura(mc.value, markerTesto);
          if (d.azione === 'scrivi') mc.value = d.valore;
        }
        fileReport.extraAggiunte++;
      }

      if (!dryRun && (fileReport.aggiornate > 0 || fileReport.extraAggiunte > 0)) {
        backupFile(file, stamp);
        await salva(wb, file);
      }
    } catch (e) {
      fileReport.saltato = true;
      fileReport.errore = e instanceof Error ? e.message : String(e);
    }
    report.file.push(fileReport);
  }

  // extra di comuni senza file
  report.extraNonCollocate = trovaExtra(lavori, idConsumati)
    .filter((l) => !comuniConFile.has(norm(l.comune)))
    .map((l) => ({ id: l.id, comune: l.comune, matricola: l.matricola, esecutore: l.esecutore }));

  return report;
}
```

> Note: la colonna `data` resta date-aware su pianificate **ed** extra perché entrambe passano per `scriviCella` → `decidiScritturaData`. Il marcatore non è mai nelle `regoleScrittura` (è gestito a parte, solo sugli extra, solo cella vuota via `decidiScrittura`). `row.number` è disponibile su righe exceljs (incluse quelle da `addRow`) per il `riga` del conflitto.

- [ ] Verifica verde: `npx vitest run tools/limitazioni-sync/agente.test.ts` → 3 `it` verdi.
- [ ] `node --check tools/limitazioni-sync/agente.mjs` → exit 0 (nota: `main()` ancora vecchio — verrà aggiornato in C6; il file resta sintatticamente valido).
- [ ] **Commit:** `feat(lim-sync): eseguiGiro guidato dalla mappatura (per-nome, esito via esitoOk, data date-aware, marcatore extra)`

---

### Task C6 — `main()` tick-gated con `scanColonne` + mappatura

**Files:**
- `tools/limitazioni-sync/agente.mjs` (modifica — riscrive `main`)

Scopo: `main()` diventa tick-gated. Flusso: `scanColonne(cartella)` → `tick({ baseUrl, exportKey, files })` → se `!eseguiOra` esci (heartbeat + colonne già inviati); altrimenti `finestra` → `fetchLavori` → `eseguiGiro({...mappatura, esitoPositivo, esitoNegativo, dryRun})` → `scriviLog` → `inviaReport`. `baseUrl = baseUrlDaEndpoint(cfg.endpointUrl)`. `config.json` resta solo statico (`endpointUrl`, `exportKey`, `cartella`).

> `main()` fa solo I/O orchestrante e non è coperto da unit test (come oggi). Il gate è `node --check` + le suite verdi dei moduli che importa. Mantieni `scanColonne` "economico": chiamato una volta a tick (le intestazioni servono ai menu del modulo); `eseguiGiro` parte solo se `eseguiOra`.

- [ ] Modifica `tools/limitazioni-sync/agente.mjs` — aggiungi gli import in cima (sotto gli altri import):

old:
```js
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';
```
new:
```js
import { fetchLavori } from './lib/fetchLavori.mjs';
import { finestra } from './lib/finestra.mjs';
import { scanColonne } from './lib/scanColonne.mjs';
import { tick, inviaReport, baseUrlDaEndpoint } from './lib/apiAgente.mjs';
```

- [ ] Sostituisci interamente `main()`.

old:
```js
async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const now = new Date();
  const oggi = now.toISOString().slice(0, 10);
  const { from, to } = finestra(oggi, cfg.finestraGiorni ?? 15);
  const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({ cartella: cfg.cartella, lavori, dryRun: !!cfg.dryRun, stamp });
  try {
    scriviLog(cfg.cartella, stamp, report);
  } catch (e) {
    console.error(`[lim-sync] impossibile scrivere il log: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`[${stamp}] lavori=${lavori.length} dryRun=${!!cfg.dryRun}`);
  console.log(JSON.stringify(report, null, 2));
}
```
new:
```js
async function main() {
  const cfgPath = path.join(import.meta.dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const baseUrl = baseUrlDaEndpoint(cfg.endpointUrl);

  // 1) Heartbeat + invio colonne: l'app decide se è il momento di girare.
  let files = [];
  try {
    files = await scanColonne(cfg.cartella);
  } catch (e) {
    console.error(`[lim-sync] scanColonne fallito (best-effort): ${e instanceof Error ? e.message : e}`);
  }
  const ris = await tick({ baseUrl, exportKey: cfg.exportKey, files });
  const { eseguiOra, dryRun, finestraGiorni, mappatura, esitoPositivo, esitoNegativo } = ris;

  if (!eseguiOra) {
    console.log(`[lim-sync] tick: in attesa (eseguiOra=false). File scansionati: ${files.length}.`);
    return;
  }

  // 2) È il momento: scarica i lavori della finestra ed esegui il giro.
  const now = new Date();
  const oggi = now.toISOString().slice(0, 10);
  const { from, to } = finestra(oggi, finestraGiorni ?? 15);
  const stamp = oggi.replaceAll('-', '') + '-' + now.toISOString().slice(11, 16).replace(':', '');
  const lavori = await fetchLavori({ endpointUrl: cfg.endpointUrl, exportKey: cfg.exportKey, from, to });
  const report = await eseguiGiro({
    cartella: cfg.cartella, lavori, dryRun: !!dryRun, stamp,
    mappatura, esitoPositivo, esitoNegativo,
  });

  try {
    scriviLog(cfg.cartella, stamp, report);
  } catch (e) {
    console.error(`[lim-sync] impossibile scrivere il log: ${e instanceof Error ? e.message : e}`);
  }

  // 3) Feedback all'app.
  try {
    await inviaReport({ baseUrl, exportKey: cfg.exportKey, report });
  } catch (e) {
    console.error(`[lim-sync] inviaReport fallito: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`[${stamp}] lavori=${lavori.length} dryRun=${!!dryRun}`);
  console.log(JSON.stringify(report, null, 2));
}
```

> `dryRun`, `finestraGiorni`, `mappatura`, `esitoPositivo`, `esitoNegativo` ora vengono **dall'app** (risposta del tick), non più da `config.json`. Il `config.json` statico resta `{ endpointUrl, exportKey, cartella }`.

- [ ] `node --check tools/limitazioni-sync/agente.mjs` → exit 0.
- [ ] Verifica completa della Part C verde: `npx vitest run tools/limitazioni-sync/` → tutti i file della cartella verdi (dataCella, colonne, scanColonne, apiAgente, agente + i preesistenti match/scrittura/excelIO/finestra/fetchLavori invariati).
- [ ] `node --check` su tutti i `.mjs` toccati/nuovi:
  - `node --check tools/limitazioni-sync/agente.mjs`
  - `node --check tools/limitazioni-sync/lib/colonne.mjs`
  - `node --check tools/limitazioni-sync/lib/dataCella.mjs`
  - `node --check tools/limitazioni-sync/lib/scanColonne.mjs`
  - `node --check tools/limitazioni-sync/lib/apiAgente.mjs`
  → tutti exit 0.
- [ ] **Commit:** `feat(lim-sync): main() tick-gated con scanColonne + mappatura dall'app`

---

#### Note di chiusura Part C
- `config.example.json` andrà aggiornato a `{ endpointUrl, exportKey, cartella }` (rimuovere `finestraGiorni`/`dryRun`, ora dall'app) — non è bloccante per i gate ma è coerente con `main()`. (Path: `tools/limitazioni-sync/config.example.json`.)
- Gli endpoint `/api/agente/tick` e `/api/agente/report` (Part endpoint) devono essere live perché `main()` giri end-to-end sul PC; le Task C non li toccano.
- La firma-master più larga (C2) cambia `trovaRigaIntestazione` (in `excelIO.mjs`, via `isFileMaster`) ma NON richiede modifiche a `excelIO.mjs`: usa già `isFileMaster`. La suite `excelIO.test.ts` resta verde (header di test contiene comunque ORDINE+MATRICOLA).

---

## Part E — Deploy e messa in opera (manuale, dopo Piano A + Piano B)

### Task E1 — Deploy
- [ ] Suite mirata: `npx vitest run lib/agente/ lib/limitazione/exportLimMassive.test.ts tools/limitazioni-sync/` → verdi; `npx tsc --noEmit` → 0 nuovi errori.
- [ ] Lancia la migration `supabase/migrations/20260616160000_agente.sql` su prod (la lancia l'utente).
- [ ] Con OK esplicito dell'utente: `git push origin <branch>:main` → Vercel deploya endpoint + modulo. Verifica `POST /api/agente/tick` con la chiave → 200.
- [ ] Impostazioni → Utenze: abilita il modulo **Agente** all'admin.
- [ ] Ricopia `tools/limitazioni-sync` aggiornata sul PC (sovrascrivi `.mjs`/`lib`; `config.json` resta).
- [ ] Task Scheduler da giornaliero a **orario** (utente normale, no admin):
  ```powershell
  $node = "C:\Users\edgardo.perrelli\node\node-v24.16.0-win-x64\node.exe"
  $agente = "C:\Users\edgardo.perrelli\Desktop\tools\tools\limitazioni-sync\agente.mjs"
  schtasks /Create /TN "LimitazioniMassiveSync" /TR "\`"$node\`" \`"$agente\`"" /SC HOURLY /F
  ```
- [ ] Smoke su `/hub/agente`: imposta giorni/ora/mappa/testi, Salva; `schtasks /Run /TN "LimitazioniMassiveSync"`; verifica "ultimo contatto" aggiornato, le colonne rilevate, e (a giro) un nuovo run nello Storico.



---

## Self-Review (Piano A)
- **Spec §1b (mappa configurabile per nome):** coperta da Part A (validaMappatura, decisione) + Part C (risolviColonna, eseguiGiro map-driven). ✅
- **Testi esito configurabili + esitoOk additivo:** Part B (buildRigaLimMassive additivo) + Part C (esito via esitoOk+testi). ✅
- **Rilevamento colonne (nuove/sparite):** Part A (diffColonne) + Part B (tick files[] upsert) + Part C (scanColonne). ✅
- **Hardening §1c:** master odl+matricola, normNome robusto, colonna assente=salta, marcatore sicuro, data date-aware su extra, scan throttle → Part C. ✅
- **Migration completa (mappatura/esiti/file_colonne):** Part B. ✅
- Placeholder/coerenza nomi: vedi i rilievi del revisore applicati prima del commit.
