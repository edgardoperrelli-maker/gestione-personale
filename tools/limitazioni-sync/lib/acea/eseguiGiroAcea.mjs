// tools/limitazioni-sync/lib/acea/eseguiGiroAcea.mjs
// Orchestrazione: lock → driver(export) → parse → aggiorna master (chirurgico) → report.
import path from 'node:path';
import { backupFile } from '../excelIO.mjs';
import { norm } from '../match.mjs';
import { parseExport } from './parseExport.mjs';
import { aggiornaStatoXlsx } from './aggiornaStatoXlsx.mjs';
import { acquisisci, rilascia } from './lock.mjs';
import { verificaModificaEsterna, registraScrittura } from '../sincronizzazioneWatch.mjs';
import { loginEdEsporta } from './driver.mjs';
import { fetchSaracinesche as fetchSaracinescheDefault } from '../apiAgente.mjs';
import { risolviMaster, elencoMasterMassive } from './risolviMaster.mjs';

function reportBase(extra) {
  return { tipo: 'acea-stato', dryRun: false, lavori: 0, file: [], extraNonCollocate: [], ...extra };
}

/** Mappa odl(norm)→'SI' dalle righe dell'endpoint saracinesche. Best-effort: qualunque errore
 *  ritorna null (nessuna scrittura saracinesca in questo giro; lo Stato Operazione non è toccato). */
async function caricaSaracinescaMap({ baseUrl, exportKey, fetchSaracinesche }) {
  try {
    const righe = await fetchSaracinesche({ baseUrl, exportKey });
    const m = new Map();
    for (const r of righe) {
      const odl = norm(r.odl);
      if (odl) m.set(odl, String(r.saracinesca ?? '').trim() || 'SI');
    }
    return m;
  } catch (e) {
    console.error(`[lim-sync] fetchSaracinesche fallito (best-effort): ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function eseguiGiroAcea({
  cfg, stamp, target = 'dunning', driver = loginEdEsporta, nowMs = Date.now(),
  baseUrl, exportKey, fetchSaracinesche = fetchSaracinescheDefault, statePath,
}) {
  const acea = cfg.acea;
  // Un target = UNO O PIU' master su cui riversare lo STESSO export: 'dunning' (master DUNNING),
  // '<COMUNE>' (il file del comune nelle limitazioni massive), 'TUTTI' (tutti i comuni).
  // login/ricerca/export/download restano CONDIVISI: un solo giro Playwright per qualunque target
  // (ACEA e' lenta e inaffidabile: moltiplicare gli export per comune moltiplicherebbe i fallimenti).
  const masters = risolviMaster({ acea, target, elencoFile: elencoMasterMassive(cfg.cartella) });
  if (masters.length === 0) {
    return reportBase({
      target,
      erroreGlobale: `Nessun master per il target "${target}": manca "${target}.xlsx" nella cartella delle limitazioni massive?`,
    });
  }
  // Il primo master porta login/ricerca/export/download (condivisi, dalla radice del config).
  const a = masters[0].a;
  const lockPath = path.join(path.dirname(a.masterPath), 'acea.lock');
  if (!acquisisci(lockPath, { nowMs })) {
    return reportBase({ saltato: true, erroreGlobale: 'Giro ACEA già in corso (lock).' });
  }
  try {
    const fileExport = await driver(a, { stamp });
    const { righe, erroreColonne } = await parseExport(fileExport, {
      foglio: a.export?.foglio, colonnaOdl: a.export.colonnaOdl, colonnaStato: a.export.colonnaStato,
      colonnaOperatore: a.export?.colonnaOperatore, colonnaOperatoreNome: a.export?.colonnaOperatoreNome,
      // Causa di scostamento ACEA (per il SAL "pagato": solo causali E). Default sul nome standard
      // dell'export; se la colonna manca, parseExport degrada morbido (causale '').
      colonnaCausale: a.export?.colonnaCausale ?? 'Causa dello scostamento',
    });
    if (erroreColonne) {
      return reportBase({ erroreGlobale: `Export: colonne "${a.export.colonnaOdl}"/"${a.export.colonnaStato}" non trovate.` });
    }

    // Pre-marcatura proattiva: assegnatario CORRENTE per-ODL dall'export (se è configurata la colonna
    // operatore). L'app la usa per pre-segnare gli ODL già assegnati alla risorsa giusta prima del giro
    // di assegnazione. Dedup per ODL (primo vince); solo righe con un assegnatario valorizzato.
    const preMap = new Map();
    for (const r of righe) {
      const odl = String(r.ordine ?? '').trim();
      const ass = String(r.operatore ?? '').trim();
      if (odl && ass && !preMap.has(odl)) preMap.set(odl, ass);
    }
    const preassegnati = [...preMap.entries()].map(([odl, assegnatario]) => ({ odl, assegnatario }));

    // Snapshot PORTALE per la Produzione economica (SAL/audit): foto corrente ODL→stato dall'intero
    // export ACEA (non solo le righe cambiate). L'app la ingerisce in acea_portale_snapshot.
    const portaleSnapshot = righe
      .filter((r) => String(r.ordine ?? '').trim())
      .map((r) => ({
        odl: String(r.ordine).trim(),
        stato: String(r.stato ?? ''),
        operatore: String(r.operatore ?? '').trim() || undefined,
        causa: String(r.causale ?? '').trim() || undefined,
      }));

    // Saracinesca (dal nostro DB, non dal Cruscotto): SOLO per il DUNNING e solo se la colonna è
    // configurata e l'app ha fornito baseUrl/exportKey. Best-effort: un fetch fallito non deve mai
    // bloccare la scrittura dello Stato Operazione.
    const eDunning = String(target ?? 'dunning').trim().toLowerCase() === 'dunning';
    const saracinescaMap = (eDunning && a.masterColonnaSaracinesca && baseUrl && exportKey)
      ? await caricaSaracinescaMap({ baseUrl, exportKey, fetchSaracinesche })
      : null;

    // Lo STESSO export viene riversato su ogni master del target (uno solo, salvo 'TUTTI').
    const fileReport = [];
    let invariate = 0;
    let daChiedereTot = 0;
    let saracinescaScritte = 0;
    let avvisoClobber = null;
    // "Non agganciate" = ODL che non trovano riga in NESSUNO dei master lavorati (intersezione).
    // Per-master sarebbe fuorviante: con 'TUTTI' gli ODL di Labico sono "non agganciati" su
    // ZAGAROLO.xlsx solo perche' stanno nell'altro file.
    let nonAgganciate = null;

    for (const { a: m } of masters) {
      const nome = path.basename(m.masterPath);
      // Osservabilità: il master è cambiato tra l'ultima scrittura dell'agente e ora? (clobber SharePoint).
      // Va letto PRIMA di sovrascrivere. Best-effort: non deve mai bloccare la scrittura.
      const clobber = verificaModificaEsterna(m.masterPath, { statePath });
      if (clobber) {
        console.error(`[lim-sync] ⚠ ${nome}: la scrittura precedente dell'agente è stata SOVRASCRITTA` +
          ` (ora mtime ${clobber.attuale.mtimeIso}${clobber.probabileServer ? ', versione dal server' : ''}).` +
          ` Probabile file aperto/salvato da altri su SharePoint.`);
        if (!avvisoClobber) avvisoClobber = clobber;
      }

      // Scrittura CHIRURGICA: tocca solo le celle di Stato Operazione/Saracinesca/Automazione (preserva
      // AutoFiltro, formattazione, ordine righe, altri fogli). Backup solo se ci sono modifiche da scrivere.
      const rep = await aggiornaStatoXlsx(m.masterPath, righe, {
        foglio: m.foglio,
        masterColonnaOdl: m.masterColonnaOdl,
        masterColonnaStato: m.masterColonnaStato,
        masterColonnaAutomazione: m.masterColonnaAutomazione,
        masterColonnaSaracinesca: m.masterColonnaSaracinesca,
        saracinescaMap,
        daChiedere: m.daChiedereSeVuoto === true,
        backup: () => backupFile(m.masterPath, stamp),
      });

      // Un master con le colonne sbagliate non deve far fallire gli altri (con 'TUTTI' puo' capitare
      // un .xlsx che master non è): lo si salta segnalandolo, il giro prosegue.
      if (rep.erroreColonne) {
        fileReport.push({
          file: nome, master: false, aggiornate: 0, extraAggiunte: 0, conflitti: [], colonneAssenti: [],
          righe: [], saltato: true,
          errore: `Master: colonne "${m.masterColonnaOdl}"/"${m.masterColonnaStato}" non trovate.`,
        });
        continue;
      }

      const set = new Set(rep.nonAgganciate ?? []);
      nonAgganciate = nonAgganciate === null ? set : new Set([...nonAgganciate].filter((o) => set.has(o)));

      invariate += rep.invariate ?? 0;
      daChiedereTot += rep.daChiedere ?? 0;
      saracinescaScritte += rep.saracinescaScritte ?? 0;
      fileReport.push({
        file: nome, master: true, aggiornate: rep.aggiornate,
        extraAggiunte: 0, conflitti: rep.conflitti ?? [], colonneAssenti: [], righe: rep.righe,
        saltato: false, errore: null,
      });

      // Se l'agente ha davvero scritto, registra la versione appena prodotta come baseline: al giro
      // successivo `verificaModificaEsterna` saprà dire se è stata sovrascritta da altri (clobber SharePoint).
      const haScritto = (rep.aggiornate ?? 0) > 0 || (rep.saracinescaScritte ?? 0) > 0 || (rep.daChiedere ?? 0) > 0;
      if (haScritto) registraScrittura(m.masterPath, { statePath, nowIso: new Date().toISOString() });
    }

    // Nessun master lavorato (tutti con colonne sbagliate): resta un errore di giro, come prima.
    if (nonAgganciate === null) {
      return reportBase({
        target, lavori: righe.length, file: fileReport,
        erroreGlobale: fileReport[0]?.errore ?? 'Nessun master aggiornabile.',
      });
    }

    return reportBase({
      target,
      lavori: righe.length,
      file: fileReport,
      extraNonCollocate: [...nonAgganciate].map((odl) => ({ odl })),
      invariate,
      daChiedere: daChiedereTot,
      saracinescaScritte,
      clobberPrecedente: avvisoClobber || undefined,
      preassegnati,
      portaleSnapshot,
    });
  } catch (e) {
    return reportBase({ erroreGlobale: e instanceof Error ? e.message : String(e) });
  } finally {
    rilascia(lockPath);
  }
}
