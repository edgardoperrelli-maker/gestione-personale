// tools/limitazioni-sync/lib/risolviPathConfig.mjs
// Risolve i path del config quando la cartella commessa viene RINOMINATA su SharePoint
// (caso 20/07/2026: "CP 20260002_..." → "20260002_...": l'agente restava su un path morto e il
// log writer ricreava un albero fantasma vuoto). Politica PRUDENTE: si risolve SOLO se sotto lo
// stesso antenato esiste ESATTAMENTE UNA cartella gemella con lo stesso resto di percorso
// distintivo (es. 8_LAVORI\LIMITAZIONI MASSIVE) contenente almeno un master .xlsx.
// Zero o più candidate → config invariato + avviso: MAI indovinare dove scrivere.
import fs from 'node:fs';
import path from 'node:path';

/** True se dir contiene almeno un .xlsx "vero" (non lock ~$). False anche se dir non esiste. */
function haXlsx(dir) {
  try {
    return fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
  } catch {
    return false;
  }
}

/** Sostituisce il prefisso (case-insensitive, path Windows) in TUTTE le stringhe del cfg. */
function sostituisciPrefisso(v, vecchio, nuovo) {
  if (typeof v === 'string') {
    return v.toLowerCase().startsWith(vecchio.toLowerCase()) ? nuovo + v.slice(vecchio.length) : v;
  }
  if (Array.isArray(v)) return v.map((x) => sostituisciPrefisso(x, vecchio, nuovo));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sostituisciPrefisso(x, vecchio, nuovo)]));
  }
  return v;
}

/**
 * @returns {{ cfg: object, avviso: string | null }} cfg NUOVO se risolto, lo STESSO se invariato.
 */
export function risolviPathConfig(cfg) {
  const cartella = cfg?.cartella;
  if (!cartella) return { cfg, avviso: null };
  const esisteva = fs.existsSync(cartella);
  if (esisteva && haXlsx(cartella)) return { cfg, avviso: null }; // tutto in ordine: costo zero

  // Livelli "sospetti di rinomina": SOLO il parent (8_LAVORI) e il nonno (la commessa, il caso
  // reale del 20/07). MAI l'ultimo segmento — il resto di percorso sotto il sospetto è il filtro
  // che evita falsi agganci (es. CONTABILITA' ha xlsx ma non contiene "LIMITAZIONI MASSIVE") —
  // e MAI più in alto: cercare gemelle vicino alla radice del disco aggancerebbe cartelle a caso.
  const segmenti = cartella.split(path.sep);
  for (let i = segmenti.length - 2; i >= Math.max(1, segmenti.length - 3); i--) {
    const antenato = i === 1 ? segmenti[0] + path.sep : segmenti.slice(0, i).join(path.sep);
    const sospetto = segmenti[i];
    const resto = segmenti.slice(i + 1);
    if (!fs.existsSync(antenato)) continue;
    let sorelle;
    try {
      sorelle = fs.readdirSync(antenato, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.toLowerCase() !== sospetto.toLowerCase());
    } catch {
      continue;
    }
    const candidate = sorelle.filter((d) => haXlsx(path.join(antenato, d.name, ...resto)));
    if (candidate.length === 0) continue;
    if (candidate.length > 1) {
      return {
        cfg,
        avviso: `Cartella master non utilizzabile (${cartella}) e risoluzione AMBIGUA: piu' candidate sotto ${antenato} (${candidate.map((d) => d.name).join(', ')}). Aggiorna a mano config.json.`,
      };
    }
    const vecchioPrefisso = path.join(antenato, sospetto);
    const nuovoPrefisso = path.join(antenato, candidate[0].name);
    return {
      cfg: sostituisciPrefisso(cfg, vecchioPrefisso, nuovoPrefisso),
      avviso: `Percorso commessa cambiato: "${sospetto}" -> "${candidate[0].name}" (sotto ${antenato}). Config risolto in memoria per questo giro: aggiorna config.json.`,
    };
  }

  if (!esisteva) {
    return { cfg, avviso: `Cartella non trovata: ${cartella} (nessuna gemella con master .xlsx: risoluzione automatica impossibile).` };
  }
  return { cfg, avviso: null }; // esiste ma senza master e nessuna alternativa: vuota legittima
}
