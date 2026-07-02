# Personale ACEA: giorni feriali, etichetta pratica, grafico esiti — Design

**Data**: 2026-07-02
**Stato**: approvato a voce dall'utente (sessione 02/07), in attesa di review scritta
**Contesto**: segue il merge della dashboard direzione (PR #67, `99186ff`). L'utente, vedendo i dati reali (122,32 giornate-uomo · resa 1.106 €/gg nel periodo 02/06→02/07), chiede tre correzioni al blocco Personale.

## Obiettivo

1. La card "Giornate-uomo 122,32" è poco spiegabile alla dirigenza → presentarla come **«N operatori × M gg»**.
2. Le giornate-uomo devono contare **solo i giorni feriali (lun–ven)**: il sabato è un canale a parte (solo attivazioni), la domenica non è lavorativa.
3. Nuovo grafico: **percentuale esiti positivi/negativi/non lavorati sull'ASSEGNATO** di ogni operatore, con la produzione € accanto.

## Decisioni (dal brainstorming con l'utente)

| Decisione | Scelta | Rationale |
|---|---|---|
| Frazione giornaliera | **RESTA** (interventi ACEA lavorati / totale lavorati nel giorno) | L'utente ha scelto di cambiare solo la presentazione, non il calcolo: la frazione anti-sovrastima (doppio territorio) rimane valida |
| Card KPI | Valore «9 op × 122 gg» (giornate feriali arrotondate all'INTERO), titolo «Personale impiegato» | Numero pratico e spiegabile; il pro-quota resta dichiarato in nota |
| Sabato | Escluso da giornate e resa; mostrato A PARTE come «Sabati (attivazioni): N gg · € M» | Il sabato è solo attivazioni: dentro alla resa feriale la sporcherebbe; sparire del tutto nasconderebbe un canale reale |
| Domenica | Esclusa COMPLETAMENTE dal blocco personale (né giornate, né €, né riga separata) | Non lavorativa; eventuali righe domenicali sono rumore. I loro € restano SOLO nelle card economiche generali |
| Resa €/giornata | **Feriale coerente**: produzione € dei soli lun–ven ÷ giornate feriali (numeratore e denominatore omogenei) | Togliere i sabati solo dal denominatore gonfierebbe la resa |
| Card Produzione (totale) | INVARIATA (tutti i giorni) | È fatturato: non si tocca |
| Grafico esiti — base | Tutti gli interventi ACEA-effettivi **assegnati** all'operatore nel periodo | 3 fette: % positivi (verde), % negativi (rosso), % non lavorati (grigio). I non-lavorati sono il fenomeno "saturazione" da mostrare alla dirigenza |
| Grafico esiti — posizione | Si AGGIUNGE (terzo grafico del blocco personale, tutta larghezza), presente sia in-app sia in presentazione | I due grafici esistenti restano (impegno nel tempo perde i weekend dall'asse) |

## Regole di calcolo

### Giorno feriale
`feriale(data) = getUTCDay(data) ∈ {1..5}` (data `YYYY-MM-DD` interpretata a mezzanotte UTC, stessa tecnica del lunedì-ISO già usata in `serieTrend.ts`). Sabato = 6, domenica = 0.

### Giornate-uomo (modificato)
Come oggi (frazione per operatore/giorno sui lavorati, `stato='completato'` qualsiasi esito), MA:
- i giorni **sab/dom sono esclusi** da `totaleGiornate`, `perOperatore[].giornate` e `perGiorno` (il grafico "Impegno nel tempo" mostra solo giorni feriali);
- le frazioni dei **sabati** si accumulano in un aggregato separato `sabato.giornate`;
- le **domeniche** vengono scartate del tutto.

### Produzione feriale e resa (modificato)
- `valoreFeriale` = somma € delle righe di produzione (post-dedup massive) con data feriale — TUTTE le righe, incluse le saracinesche senza operatore.
- `sabato.valore` = somma € delle righe di produzione con data di sabato (saracinesche incluse).
- Resa KPI = `valoreFeriale / totaleGiornate` (feriale/feriale). Resa per operatore = `valoreFeriale` dell'operatore / giornate feriali dell'operatore.
- **`perOperatore[].valore` resta il TOTALE del periodo** (tutti i giorni): è il numero del grafico "€ per operatore" e dell'etichetta € nel grafico esiti — deve restare riconciliabile con la card Produzione. Il feriale vive nel campo NUOVO `perOperatore[].valoreFeriale`, usato solo per la resa.
- `perOperatore[].interventiAcea` conta i soli interventi ACEA lavorati nei giorni FERIALI (coerente con le giornate mostrate accanto; il lavoro del sabato è rappresentato dalla riga Sabati).
- La produzione della domenica non entra né in `valoreFeriale` né in `sabato.valore` (resta solo nel totale generale).

### Esiti sull'assegnato (nuovo)
Base per operatore = **ogni riga** della tabella `interventi` con committente effettivo `acea` (via `attivitaCanonica`, stessa risoluzione della produzione) e `staff_id` valorizzato, con data nel range. Conteggio per RIGA (nessuna dedup per matricola: è una vista di carico assegnato, non di fatturato). Le saracinesche derivate dal master NON contano (non sono interventi assegnati).
- `positivi` = `esitoOkDaIntervento(...) === true`
- `negativi` = `=== false` (lavorato, esito ko)
- `nonLavorati` = `=== null` (assegnato, mai chiuso)
- `assegnati` = somma dei tre. Percentuali calcolate in presentazione (i conteggi sono il dato).
- `valore` € accanto = produzione totale dell'operatore nel periodo (lo stesso numero del grafico "€ per operatore", per coerenza visiva — NON il feriale).

## Modifiche per file

### Lib pura
- **`lib/produzione/aggregaPersonale.ts`** (modifica): la firma diventa
  `aggregaPersonale(righe: RigaLavoro[], euroPerOperatore: Aggregato[], euroFerialePerOperatore: Aggregato[], extra: { valoreFeriale: number; sabatoValore: number })`.
  `ProduzionePersonale` acquisisce `valoreFeriale: number` e `sabato: { giornate: number; valore: number }`; `PersonaleOperatore` acquisisce `valoreFeriale: number` (il `valore` resta totale) e la `resa` diventa `valoreFeriale/giornate`; `interventiAcea` e `perGiorno` contano solo giorni feriali; le frazioni del sabato alimentano `sabato.giornate`, la domenica si scarta. Helper interno `feriale(data)` su `getUTCDay`. Test esistenti aggiornati (le date nei test sono già lun–mer) + casi nuovi: riga di sabato → `sabato.giornate`, non nelle giornate; riga di domenica → scartata ovunque.
- **`lib/produzione/aggregaEsiti.ts`** (nuovo, puro + test): `interface RigaEsito { staffId; operatore; esitoOk: boolean | null }`, `interface EsitoOperatore { chiave; label; assegnati; positivi; negativi; nonLavorati; valore }`, `aggregaEsiti(righe: RigaEsito[], euroPerOperatore: Aggregato[]): EsitoOperatore[]` ordinato per `assegnati` desc.

### Loader
- **`lib/produzione/load.ts`**: nel loop interventi già esistente raccoglie anche `righeEsito` (canon acea + staffId, qualsiasi esito, data in range). Post-dedup produzione: split feriale/sabato delle righe per calcolare `euroFerialePerOperatore`, `valoreFeriale`, `sabatoValore` (l'`euroPerOperatore` TOTALE è già `produzione.perOperatore`). Chiama `aggregaPersonale` (nuova firma a 4 argomenti) e `aggregaEsiti(righeEsito, produzione.perOperatore)`. `ProduzioneEconomica` acquisisce `esiti: EsitoOperatore[]`.

### UI (componenti condivisi tab + presentazione)
- **`economica/tipi.ts`**: `DatiProduzione` acquisisce `esiti`; `personale` col tipo esteso.
- **`economica/KpiDirezione.tsx`**: card «Personale impiegato» = `«${operatoriAttivi} op × ${Math.round(totaleGiornate)} gg»`, nota "giornate feriali lun–ven; giorni misti pro-quota". Card «Resa €/giornata» = `valoreFeriale / totaleGiornate`, nota "produzione feriale / giornate feriali".
- **`economica/PersonaleImpegno.tsx`**: nessun filtro aggiuntivo (i dati arrivano già feriali); sotto il grafico impegno, riga `Sabati (attivazioni): N gg · € M` (nascosta se sabato.giornate = 0 e sabato.valore = 0).
- **`economica/EsitiOperatore.tsx`** (nuovo): barre orizzontali impilate al 100% (recharts `stackOffset="expand"`), top 12 operatori per assegnati; fette positivi=`success`, negativi=`danger`, non lavorati=grigio (`brandTextMuted`/subtle); tooltip con conteggi+percentuali+€; € produzione come etichetta a destra della barra; legenda; empty state; nota a piè "base = interventi assegnati nel periodo".
- **`PerformanceEconomica.tsx`** e **`PresentazioneProduzione.tsx`**: `<EsitiOperatore dati={dati} />` a tutta larghezza dopo `<PersonaleImpegno />`.

### Excel (entrambe le vie)
- **`exportExcel.ts`** (fallback): foglio "Dati - personale" acquisisce colonne Assegnati / Positivi / Negativi / Non lavorati e riga finale «Sabati (attivazioni)» con giornate+€; giornate/resa ora feriali (automatico dagli aggregati).
- **`excelInject.ts`** (`fogliPersonale`, via template): stesse colonne/riga.
- Fixture dei test excel aggiornate al tipo esteso.

## Fuori scope
- Trend, composizione, SAL, audit: invariati.
- La definizione di sabato è puramente calendariale (non si guarda il tipo attività "attivazione").
- Nessuna migrazione DB, nessun endpoint nuovo, nessuna dipendenza nuova.

## Casi limite
- Operatore con SOLO lavoro di sabato nel periodo → 0 giornate feriali, compare solo nell'aggregato Sabati; se ha € feriali 0 la resa è `null` (già gestito).
- Riga di domenica → ignorata ovunque nel blocco personale (documentato in nota metodologica).
- `Math.round(122.32) = 122` nella card; il dettaglio per operatore (tooltip/Excel) conserva 2 decimali.
- Divisioni per zero: percentuali esiti con `assegnati = 0` → operatore non mostrato (non può esistere: se è in lista ha ≥1 riga).

## Criteri di accettazione
1. Card: «9 op × 122 gg» (coi dati attuali del periodo 02/06→02/07; il numero esatto può variare di poco togliendo i weekend).
2. Resa = produzione feriale / giornate feriali; card Produzione totale invariata (135.327,94 € sul periodo di verifica).
3. Grafico impegno senza barre di sabato/domenica; riga Sabati con € e giornate.
4. Nuovo grafico esiti: 3 fette al 100% per operatore, € a destra, in tab E presentazione.
5. Excel con le colonne esiti e la riga Sabati su entrambe le vie.
6. Gate: tsc 0, vitest lib/produzione verde (test aggiornati+nuovi), eslint 0 sui file toccati, build verde.

## Nota operativa
Il file spec resta untracked nel checkout principale finché non parte l'implementazione: verrà committato nel worktree di feature (lezione dalla PR #67: rimuovere subito la copia untracked dal checkout principale dopo il commit nel worktree, per non bloccare il `git pull` post-merge).
