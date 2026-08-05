import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { leggiExportSal } from '@/lib/produzione/leggiExportSal';
import { chiaveRiga, lottiDaExport, proponiLotti, righeDaLotti, type LottoProposto } from '@/lib/produzione/importSal';

export const runtime = 'nodejs';
// L'export SAL di ACEA è cumulativo: cresce di un SAL al mese e a fine commessa sarà di decine di
// migliaia di righe. Il parsing sta in pochi secondi, ma il default di Vercel sarebbe stretto.
export const maxDuration = 300;

const PAGINA = 1000;
const BLOCCO_INSERT = 500;

/**
 * Import del file SAL ufficiale ACEA, dalla pagina Produzione economica.
 *
 * Fino a oggi i SAL entravano in un modo solo: il bottone «Leggi SAL» del modulo Agente, che fa
 * leggere all'agente i file "SAL N.xlsx" di una cartella su un PC acceso in ufficio. Funziona
 * finché quel PC c'è. Questa rotta è l'altra porta — si carica il file e basta — e serve al giro
 * di controllo che si fa a ogni SAL: ACEA pubblica l'export, lo si carica, e la pagina dice
 * subito se il consuntivo del mese corrisponde alla produzione.
 *
 * Due passi, non uno: POST senza `assegnazioni` è una ANTEPRIMA e non scrive niente. Il file è
 * cumulativo e contiene anche i SAL già pagati; prima di toccare il database bisogna vedere come
 * viene diviso e poter correggere il numero di SAL proposto.
 */

/** GET: i SAL già in banca dati (numero, righe, ODL, valore, finestra lavori). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const righe = await tutteLeRigheSal();
    return NextResponse.json({ sal: riepilogoPerN(righe) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return NextResponse.json({ error: messaggio(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida: manca il file.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Nessun file caricato.' }, { status: 400 });
  }

  const esito = await leggiExportSal(await file.arrayBuffer());
  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo, dettagli: esito.dettagli }, { status: 400 });
  }

  try {
    const righeDb = await tutteLeRigheSal();
    const salPerChiave = new Map<string, number>();
    for (const r of righeDb) salPerChiave.set(chiaveRiga({ docAcquisti: r.doc_acquisti, posizione: r.posizione }), r.sal_n);
    const maxSalNoto = righeDb.reduce((m, r) => Math.max(m, r.sal_n), 0);

    const lotti = lottiDaExport(esito.righe);
    const proposti = proponiLotti(lotti, salPerChiave, maxSalNoto);

    const grezzo = form.get('assegnazioni');
    if (typeof grezzo !== 'string' || grezzo.trim() === '') {
      return NextResponse.json(
        {
          anteprima: true,
          file: file.name,
          righeLette: esito.righe.length,
          scartate: esito.scartate,
          lotti: proposti.map(senzaRighe),
          salInDb: riepilogoPerN(righeDb),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const assegnazioni = leggiAssegnazioni(grezzo);
    if (assegnazioni == null) {
      return NextResponse.json({ error: 'Assegnazioni non valide.' }, { status: 400 });
    }
    if (assegnazioni.size === 0) {
      return NextResponse.json({ error: 'Nessun lotto selezionato: non c’è niente da caricare.' }, { status: 400 });
    }

    const perSal = righeDaLotti(lotti, assegnazioni);
    const scritti: Array<{ n: number; righe: number; valore: number }> = [];
    const ora = new Date().toISOString();
    for (const [n, righe] of [...perSal.entries()].sort((a, b) => a[0] - b[0])) {
      /*
        delete+insert per numero di SAL, come fa il giro dell'agente: il file è la fonte, e ACEA
        lo riemette corretto quando sbaglia. Un upsert lascerebbe in vita le righe che ACEA ha
        tolto dal SAL, cioè proprio quelle che la correzione voleva far sparire.

        Un SAL alla volta e mai in blocco: si tocca solo ciò che è stato scelto, e il SAL di
        giugno resta dov'è anche se il file di agosto se lo porta ancora dentro.
      */
      const { error: eDel } = await supabaseAdmin.from('acea_sal').delete().eq('sal_n', n);
      if (eDel) throw new Error(`SAL ${n}: ${eDel.message}`);
      for (let i = 0; i < righe.length; i += BLOCCO_INSERT) {
        const blocco = righe.slice(i, i + BLOCCO_INSERT).map((r) => ({ ...r, raccolto_at: ora, origine: 'import' }));
        const { error: eIns } = await supabaseAdmin.from('acea_sal').insert(blocco);
        if (eIns) throw new Error(`SAL ${n}: ${eIns.message}`);
      }
      scritti.push({ n, righe: righe.length, valore: arrotonda(righe.reduce((s, r) => s + r.valore, 0)) });
    }

    return NextResponse.json(
      { ok: true, scritti, salInDb: riepilogoPerN(await tutteLeRigheSal()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: messaggio(err) }, { status: 500 });
  }
}

/** DELETE ?n=2: toglie un SAL caricato per sbaglio (o col numero sbagliato). */
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const n = Number(new URL(req.url).searchParams.get('n'));
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: 'Numero di SAL non valido.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('acea_sal').delete().eq('sal_n', n);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n }, { headers: { 'Cache-Control': 'no-store' } });
}

interface RigaSalDb {
  sal_n: number;
  odl: string;
  doc_acquisti: string;
  posizione: string;
  valore: number;
  data_completamento: string | null;
}

async function tutteLeRigheSal(): Promise<RigaSalDb[]> {
  const rows: RigaSalDb[] = [];
  for (let off = 0; ; off += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('acea_sal')
      .select('sal_n, odl, doc_acquisti, posizione, valore, data_completamento')
      .range(off, off + PAGINA - 1);
    if (error) throw error;
    const batch = (data ?? []) as RigaSalDb[];
    rows.push(...batch);
    if (batch.length < PAGINA) break;
  }
  return rows;
}

export interface SalInDb {
  n: number;
  righe: number;
  ordini: number;
  valore: number;
  dal: string;
  al: string;
}

function riepilogoPerN(righe: readonly RigaSalDb[]): SalInDb[] {
  const per = new Map<number, RigaSalDb[]>();
  for (const r of righe) {
    const g = per.get(r.sal_n);
    if (g) g.push(r);
    else per.set(r.sal_n, [r]);
  }
  return [...per.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, g]) => {
      const date = g.map((r) => r.data_completamento).filter((d): d is string => !!d).sort();
      return {
        n,
        righe: g.length,
        ordini: new Set(g.map((r) => r.odl)).size,
        valore: arrotonda(g.reduce((s, r) => s + Number(r.valore), 0)),
        dal: date[0] ?? '',
        al: date[date.length - 1] ?? '',
      };
    });
}

/** L'anteprima non rimanda indietro le righe: sono migliaia e alla UI serve solo il riepilogo. */
function senzaRighe(l: LottoProposto) {
  const { righe, ...resto } = l;
  return { ...resto, righeTotali: righe.length };
}

/** `{"2026-07-31": 2, "2026-08-03": 2}` → mappa data-lotto → numero SAL. null se malformato. */
function leggiAssegnazioni(grezzo: string): Map<string, number> | null {
  let obj: unknown;
  try {
    obj = JSON.parse(grezzo);
  } catch {
    return null;
  }
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = new Map<string, number>();
  for (const [data, n] of Object.entries(obj as Record<string, unknown>)) {
    if (n == null || n === '') continue;
    const num = Number(n);
    if (!Number.isInteger(num) || num <= 0) return null;
    out.set(data, num);
  }
  return out;
}

function arrotonda(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function messaggio(err: unknown): string {
  return err instanceof Error ? err.message : 'Errore import SAL.';
}
