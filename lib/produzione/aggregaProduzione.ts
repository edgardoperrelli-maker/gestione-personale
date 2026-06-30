// PURA: aggrega le righe di produzione (interventi positivi già valorizzati) per voce, operatore,
// territorio e giorno. Modello sul pattern di lib/performance/shape.ts (buildDistribuzioni/buildGiornaliera).
// Le voci non risolte (voce === null) confluiscono nel gruppo 'NON_RISOLTA' (in coda) e nel contatore
// `nonRisolte`, così la mancata classificazione resta sempre visibile (mai silenziosa).

export interface RigaProduzione {
  odl: string;
  voce: number | null;
  kpi: string | null; // 'EL'|'ES'|'ERC'|'ERA'|null
  data: string; // 'YYYY-MM-DD'
  staffId: string;
  operatore: string;
  territorioId: string;
  territorio: string;
  valore: number; // già valorizzato (prezzo×qty); 0 se voce/prezzo mancante
}

export interface Aggregato {
  chiave: string;
  label: string;
  conteggio: number;
  valore: number;
}

export interface ProduzioneAggregata {
  totale: { conteggio: number; valore: number };
  perVoce: Aggregato[];
  perOperatore: Aggregato[];
  perTerritorio: Aggregato[];
  perGiorno: Aggregato[];
  nonRisolte: number;
}

const ORDINE_VOCE = ['EL', 'ES', 'ERC', 'ERA', 'NON_RISOLTA'];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type Acc = { chiave: string; label: string; conteggio: number; valore: number };

function raggruppa(
  righe: RigaProduzione[],
  chiaveDi: (r: RigaProduzione) => string,
  labelDi: (r: RigaProduzione) => string,
): Map<string, Acc> {
  const m = new Map<string, Acc>();
  for (const r of righe) {
    const k = chiaveDi(r);
    let a = m.get(k);
    if (!a) {
      a = { chiave: k, label: labelDi(r), conteggio: 0, valore: 0 };
      m.set(k, a);
    }
    a.conteggio += 1;
    a.valore += r.valore;
  }
  for (const a of m.values()) a.valore = round2(a.valore);
  return m;
}

export function aggregaProduzione(righe: RigaProduzione[]): ProduzioneAggregata {
  const totale = {
    conteggio: righe.length,
    valore: round2(righe.reduce((s, r) => s + r.valore, 0)),
  };

  const perVoce = Array.from(
    raggruppa(
      righe,
      (r) => r.kpi ?? 'NON_RISOLTA',
      (r) => r.kpi ?? 'NON_RISOLTA',
    ).values(),
  ).sort((a, b) => ORDINE_VOCE.indexOf(a.chiave) - ORDINE_VOCE.indexOf(b.chiave));

  const perOperatore = Array.from(
    raggruppa(
      righe,
      (r) => r.staffId || '—',
      (r) => r.operatore || 'Sconosciuto',
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  const perTerritorio = Array.from(
    raggruppa(
      righe,
      (r) => r.territorioId || '—',
      (r) => r.territorio || 'Senza territorio',
    ).values(),
  ).sort((a, b) => b.valore - a.valore || b.conteggio - a.conteggio);

  const perGiorno = Array.from(
    raggruppa(
      righe,
      (r) => r.data.slice(0, 10),
      (r) => r.data.slice(0, 10),
    ).values(),
  ).sort((a, b) => (a.chiave < b.chiave ? -1 : a.chiave > b.chiave ? 1 : 0));

  const nonRisolte = righe.reduce((n, r) => n + (r.voce == null ? 1 : 0), 0);

  return { totale, perVoce, perOperatore, perTerritorio, perGiorno, nonRisolte };
}
