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
  // target 'zagarolo' = override masterPath/foglio/colonne + regola DA CHIEDERE.
  // login/ricerca/export/download restano CONDIVISI (stesso download per entrambi i target).
  const a = (target === 'zagarolo' && acea.zagarolo) ? { ...acea, ...acea.zagarolo } : acea;
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
    const saracinescaMap = (target === 'dunning' && a.masterColonnaSaracinesca && baseUrl && exportKey)
      ? await caricaSaracinescaMap({ baseUrl, exportKey, fetchSaracinesche })
      : null;

    // Osservabilità: il master è cambiato tra l'ultima scrittura dell'agente e ora? (clobber SharePoint).
    // Va letto PRIMA di sovrascrivere. Best-effort: non deve mai bloccare la scrittura.
    const avvisoClobber = verificaModificaEsterna(a.masterPath, { statePath });
    if (avvisoClobber) {
      console.error(`[lim-sync] ⚠ ${path.basename(a.masterPath)}: la scrittura precedente dell'agente è stata SOVRASCRITTA` +
        ` (ora mtime ${avvisoClobber.attuale.mtimeIso}${avvisoClobber.probabileServer ? ', versione dal server' : ''}).` +
        ` Probabile file aperto/salvato da altri su SharePoint.`);
    }

    // Scrittura CHIRURGICA: tocca solo le celle di Stato Operazione/Saracinesca/Automazione (preserva
    // AutoFiltro, formattazione, ordine righe, altri fogli). Backup solo se ci sono modifiche da scrivere.
    const rep = await aggiornaStatoXlsx(a.masterPath, righe, {
      foglio: a.foglio,
      masterColonnaOdl: a.masterColonnaOdl,
      masterColonnaStato: a.masterColonnaStato,
      masterColonnaAutomazione: a.masterColonnaAutomazione,
      masterColonnaSaracinesca: a.masterColonnaSaracinesca,
      saracinescaMap,
      daChiedere: a.daChiedereSeVuoto === true,
      backup: () => backupFile(a.masterPath, stamp),
    });
    if (rep.erroreColonne) {
      return reportBase({ lavori: righe.length, erroreGlobale: `Master: colonne "${a.masterColonnaOdl}"/"${a.masterColonnaStato}" non trovate.` });
    }

    // Se l'agente ha davvero scritto, registra la versione appena prodotta come baseline: al giro
    // successivo `verificaModificaEsterna` saprà dire se è stata sovrascritta da altri (clobber SharePoint).
    const haScritto = (rep.aggiornate ?? 0) > 0 || (rep.saracinescaScritte ?? 0) > 0 || (rep.daChiedere ?? 0) > 0;
    if (haScritto) registraScrittura(a.masterPath, { statePath, nowIso: new Date().toISOString() });

    return reportBase({
      target,
      lavori: righe.length,
      file: [{
        file: path.basename(a.masterPath), master: true, aggiornate: rep.aggiornate,
        extraAggiunte: 0, conflitti: rep.conflitti ?? [], colonneAssenti: [], righe: rep.righe, saltato: false, errore: null,
      }],
      extraNonCollocate: rep.nonAgganciate.map((odl) => ({ odl })),
      invariate: rep.invariate,
      daChiedere: rep.daChiedere ?? 0,
      saracinescaScritte: rep.saracinescaScritte ?? 0,
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
