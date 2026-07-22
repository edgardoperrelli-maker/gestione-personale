# Redesign «Cockpit» (direzione E+) — spec

**Stato**: approvata dal committente (mockup `docs/design/mockup-cockpit.html`, 22/07/2026).
**Base**: main dopo il merge del redesign sobrio→premium (PR #164) — questo redesign lo evolve, non lo azzera: primitive (Button/Toast/Dialog/Skeleton/chiediConferma), PWA, login, export brand restano.

## 1. Direzione

Console operativa enterprise, scuola SAP Horizon / Fluent moderna, composta così:

- **Da E (base)**: palette **zaffiro** su canvas grigio freddo, card bianche; **KPI strip** in testa ai moduli; sidebar chiara raffinata a gruppi (Campo / Ufficio / Sistema); object header con ribbon di stato.
- **Da D**: **filtri componibili a pill** («+ Filtro», rimozione con ✕); **drawer di dettaglio** laterale (click sulla riga → scheda a lato, senza cambiare pagina).
- **Da F**: contenuto del drawer ricco: anagrafica key/value, griglia foto, cronologia.

## 2. Sistema (token: NOMI invariati, cambiano i VALORI)

I consumer runtime (`useChartColors`, `resolveCssColor` MapLibre, `--terr-*`) leggono i token per nome → si toccano SOLO i valori, in entrambi i blocchi (`:root` dark e `html.light`). Meccanismo tema invariato (light = classe `.light`).

| Token (nome esistente) | Light (nuovo valore) | Note |
|---|---|---|
| `--brand-primary` | `oklch(0.42 0.14 260)` zaffiro | dark: variante più chiara `oklch(0.62 0.15 260)` |
| `--brand-primary-hover` | `oklch(0.35 0.12 260)` | |
| `--brand-bg` | `oklch(0.965 0.006 250)` canvas grigio freddo | il contenuto vive su canvas, le card sono bianche |
| `--brand-surface` | `#fff` | card |
| `--status-ok/ko/warn` | verdi/rossi/ambra ricalibrati sul canvas | contrasto ≥ 4.5:1 sul proprio soft |
| raggi/ombre | `--radius-*` e `--shadow-*` esistenti, valori ritoccati | ombra card più piatta (sh-1 del mockup) |

## 3. Componenti nuovi del sistema

| Componente | Contratto |
|---|---|
| `ObjectHeader` | `{title, sub?, ribbon?, actions?}` — card di testa modulo: titolo, ribbon di stato (es. «Sincronizzato»), azioni primarie a destra |
| `KpiCard` / `KpiStrip` | `{label, value, trend?, tone?: 'ok'\|'warn'\|'ko', spark?}` — barra colorata a sinistra, valore mono tabulare, sparkline CSS opzionale |
| `FilterPill` / `FilterBar` | pill zaffiro rimovibili (✕) + bottone tratteggiato «+ Filtro»; il testo libero resta nel campo ⌕ della barra |
| `DetailDrawer` | pannello sticky a destra della tabella (`grid 1fr 372px`, sotto 1120px va sotto/overlay): header (odl+titolo+stato), sezioni Anagrafica (kv), Foto (griglia), Cronologia (timeline), footer azioni |
| `ProgressPill` | `{done, total}` barretta + `n/m` mono (usata per le foto in tabella) |
| Sidebar (evoluzione) | gruppi **Campo / Ufficio / Sistema**, voce attiva con `inset 3px` zaffiro su soft, badge count ambra; collapse esistente conservato |
| Riga tabella «open» | riga selezionata: fondo soft + inset rail zaffiro; hover: canvas |

## 4. Applicazione a onde

1. **Onda 1 — Fondazione**: valori token (light+dark), shell (sidebar gruppi, TopBar breadcrumb+⌘K su canvas), primitive nuove (§3) con 8 stati e reduced-motion.
2. **Onda 2 — Interventi** (pagina simbolo del mockup): ObjectHeader, KPI strip (totali, % positivi, riconciliazioni, negativi 7gg — dai dati reali già presenti), FilterBar a pill sopra la tabella, tabella con ProgressPill foto + DetailDrawer.
3. **Onda 3 — Dashboard/hub + Mappa (riepilogo)**: hub come cockpit (KPI + accessi rapidi), riepilogo rapportini con gli stessi pattern.
4. **Onda 4 — Moduli restanti**: Lista attesa, Pronto intervento, Consuntivazione, Produzione, Performance, Misuratori, Assistenza, Impostazioni — ObjectHeader ovunque, KPI dove i numeri esistono già, drawer dove c'è un dettaglio-riga.
5. **Onda 5 — Rifiniture**: DESIGN.md riscritta sul sistema Cockpit, sweep incoerenze, gates finali + e2e.

Regola ponytail: nessun KPI inventato — solo numeri che i motori già espongono. Dove un modulo non ha dettaglio-riga, niente drawer.

## 5. Vincoli invariati (ereditati e confermati)

- Motori intoccabili: `lib/**`, `utils/**`, `app/api/**`, `middleware.ts` (2118 test vitest a guardia).
- Testi operatore e2e congelati («Invia rapportino», «Salva e avanti»).
- Nomi token e meccanismo tema congelati; niente `.dark`.
- Zero overflow orizzontale 320–412px; `prefers-reduced-motion`; light+dark.
- Repo pubblico: mai dati di produzione; niente nuove librerie senza ok.

## 6. Gates per onda

`npx tsc --noEmit` = 0 · eslint sui file toccati = 0 nuovi · `npm test` verde · e2e completa a fine Onda 5.

## 7. Stato attuazione

- [ ] Onda 1 · [ ] Onda 2 · [ ] Onda 3 · [ ] Onda 4 · [ ] Onda 5
