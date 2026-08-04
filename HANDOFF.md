# Handoff — App mobile Android/iOS + ripresa in locale (2026-08-04)

> Catena: lo stream precedente («Registro commesse: ACEA + AcquaLatina», 2026-07-31 →
> 2026-08-04) è **concluso e mergiato** con PR #227. Il suo handoff completo vive nella
> storia git: `git show 509847a:HANDOFF.md`. Questo file riparte con lo stream nuovo.

## Goal

Trasformare gestione-personale in un'**app installabile su telefoni e tablet, Android e
iOS**, ottimizzata per l'uso sul campo: via i link `/r/[token]` come canale operatore,
più stabilità. Account sviluppatore Apple e Google già attivi e pagati. Lo sviluppo
prosegue **in locale sul PC di Edgardo** (questa è la sessione di passaggio dal
container cloud al CLI locale).

## Current status

Verifica del progetto completata nel container cloud (tutto verde), **piano approvabile
scritto e pushato** in `docs/superpowers/plans/2026-08-04-app-mobile-capacitor.md`
(commit `c8f8b97` sul branch `claude/mobile-app-local-setup-e9sf0i`). Nessuna riga di
codice app ancora scritta: si parte con le decisioni aperte + Fase 1–2 del piano.

## Done

- **Verifica progetto** (container cloud, 2026-08-04): `npm run build` ✅ (~60 route,
  TS strict); `npm test` ✅ **354 file / 3432 test verdi** (~50s); service worker
  Serwist generato nel build di prod (`public/sw.js`); manifest PWA + icone ok
  (`app/manifest.ts`, `public/icons/`); offline outbox già solido (`lib/offline/*`).
- **Riproduzione visiva locale dimostrata**: server di prod nel container + screenshot
  Chromium/Playwright a **390×844** (telefono) e **834×1194** (tablet) sulla `/login`.
- **Progetto Supabase identificato**: «Calendario personale», id `aceztqfebringeaebvce`,
  URL `https://aceztqfebringeaebvce.supabase.co`. ⚠️ Trappola: «gestilab-aurea» nella
  stessa org sembra questo progetto ma è UN'ALTRA app (produzione economica standalone).
- **Piano in 6 fasi** committato (vedi Key decisions): rifiniture mobile web → scaffold
  Capacitor → login operatore + home «Il mio giorno» → plugin nativi campo → CI GitHub
  Actions → distribuzione privata store.

## Setup locale (prima cosa da fare sul PC)

```bash
git clone https://github.com/edgardoperrelli-maker/gestione-personale.git
cd gestione-personale
git checkout claude/mobile-app-local-setup-e9sf0i
npm install
```

Creare `.env.local` nella root (è in .gitignore, MAI committarlo):

```
NEXT_PUBLIC_SUPABASE_URL=https://aceztqfebringeaebvce.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key legacy (JWT): dashboard Supabase → Settings → API, o env Vercel>
SUPABASE_SERVICE_ROLE_KEY=<service role key: stessa fonte — serve per le API admin>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Poi: `npm run dev` → http://localhost:3000 (in dev il SW **non** viene generato — è
atteso, vedi `next.config.mjs`). Per provare PWA/service worker: `npm run build && npm start`.

## What worked

- **Loop visivo**: modifica → screenshot Playwright a viewport reali → confronto. In
  locale è ancora più semplice (browser vero + device via USB).
- **UI senza service key**: con `SUPABASE_SERVICE_ROLE_KEY` placeholder non vuoto l'app
  builda e la UI gira; solo le API admin falliscono (nel container il key vero non
  c'era; in locale mettere quello vero).
- Test e build come rete di sicurezza: girano identici ovunque.

## What did NOT work (e perché)

- **Script Playwright fuori dalla cartella del progetto** → `ERR_MODULE_NOT_FOUND`:
  la risoluzione ESM parte dalla posizione dello script, non dal cwd. Fix usato nel
  container: import assoluto `file:///…/node_modules/playwright/index.mjs` +
  `executablePath: /opt/pw-browsers/chromium`. In locale non serve: `@playwright/test`
  normale (pattern repo: `playwright.local.config.ts`, gitignorato).
- **Build nativi nel container**: impossibili — iOS richiede macOS/Xcode, manca
  l'Android SDK. Per questo i binari vanno in **GitHub Actions** (macOS runner +
  Fastlane per iOS/TestFlight; ubuntu per AAB → Play internal).
- **MCP Supabase non espone il service-role key** (by design): nel container le API
  admin erano mute. Non è un bug dell'app.

## Key decisions

- **Capacitor shell con `server.url` → web app in produzione (Vercel)** — una codebase,
  due app native, aggiornamenti = deploy web (store solo per cambi shell). Scartati:
  TWA/Bubblewrap (solo Android), static export (perderebbe SSR/API route/middleware),
  riscrittura React Native (duplicherebbe 14+ moduli).
- **Login operatore al posto dei token**: utenze Supabase estese da `staff` (ruolo
  `operatore`), sessione persistente + biometria, home «Il mio giorno» che risolve il
  giro del giorno internamente. `/r/[token]` resta come fallback in transizione.
- **Distribuzione privata**: Managed Google Play; iOS Custom Apps (ABM) o Unlisted.
- **Nativizzazione campo** (Fase 4): scanner ML Kit al posto di @zxing (sole/matricole
  rovinate), Camera nativa, Geolocation, push FCM/APNs, keep-awake.

## Key files & commands

- `docs/superpowers/plans/2026-08-04-app-mobile-capacitor.md` — **il piano completo**
  (6 fasi, rischi, decisioni aperte §7). Fonte di verità dello stream.
- `app/manifest.ts`, `app/sw.ts`, `next.config.mjs` — PWA esistente (Serwist; SW solo
  in build di prod).
- `lib/offline/*` — outbox IndexedDB + background sync: si riusa identico nell'app.
- `app/r/[token]/`, `middleware.ts`, `lib/moduleAccess.ts` — canale token e permessi
  attuali (da NON toccare senza istruzione, AGENTS.md §11).
- `npm run build` · `npm test` · `npm run e2e` — verifiche standard.
- Branch di lavoro: `claude/mobile-app-local-setup-e9sf0i` (ultimo commit `c8f8b97`).

## Open questions (bloccano l'avvio delle fasi)

1. **Perimetro moduli sul telefono operatore**: solo «Il mio giorno» + rapportino +
   scanner + foto? Anche agenda/altro? ← **bloccante Fase 1**
2. **Ok a installare Capacitor** (AGENTS.md §11.3 richiede approvazione esplicita per
   nuove librerie). ← **bloccante Fase 2**
3. Modello login operatore (username+password da `/impostazioni/utenze`? PIN?).
4. Moduli per tablet ufficio in mobilità (mappa, dashboard, misuratori?).
5. Nome app e icona store; canale iOS (Custom Apps vs Unlisted).
6. Eventi push (assegnazione giro, ODL TOP, annunci?).
7. **Sicurezza (fuori stream, da non perdere)**: 6 tabelle `bak_*_20260730` con RLS
   disabilitata (`bak_committente_manuali_20260730_{int,voci,ops}`,
   `bak_odl_impianto_20260730_{int,voci,ops}`) → abilitare RLS o eliminarle.
   Inoltre `npm audit`: 21 avvisi, quasi tutti toolchain di build.

## Next step

Sul PC locale: eseguire il **Setup locale** qui sopra e verificare che `npm run dev`
mostri la login su http://localhost:3000. Poi rispondere alle domande aperte 1 e 2
(perimetro moduli operatore + ok a Capacitor) e partire con la **Fase 1** del piano
(audit viewport moduli operatore) e la **Fase 2** (scaffold Capacitor).
