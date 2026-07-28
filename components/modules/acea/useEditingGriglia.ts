'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import {
  calcolaIncolla, celleDi, daSaltare, eventoDiUnCampo, normalizzaIntervallo, parseBloccoIncollato,
  spostaFocus, validaData, validaOperatore,
  type Cella, type ColonnaEditabile, type Intervallo,
} from '@/lib/acea/editingGriglia';
import { valoreCella, type ChiaveColonna, type RigaTabella } from '@/lib/acea/colonneTabella';

export type Operatore = { id: string; display_name: string };

/**
 * Quanto puo` essere lunga una nota.
 *
 * Non e` una regola di dominio, e` una difesa: incollare mezzo documento in una cella renderebbe
 * illeggibile il rapportino dell'operatore, che quella nota se la trova in cima alla card.
 */
const MAX_NOTA = 500;

/** Colonne modificabili, nell'ordine in cui compaiono in tabella. */
export const COLONNE_EDITABILI: ColonnaEditabile[] = ['pianificato_a', 'pianificato_il', 'note'];

/** Valore mostrato in una cella modificabile, tenendo conto delle modifiche non ancora salvate. */
export type ValoreLocale = {
  pianificato_a?: string | null; pianificato_il?: string | null; note?: string | null;
};

type Props = {
  righe: RigaTabella[];
  operatori: Operatore[];
  /**
   * Le colonne A SCHERMO, nell'ordine in cui si vedono.
   *
   * La griglia si estende su TUTTE, non sulle sole modificabili: un ODL, una matricola o un
   * indirizzo si devono poter selezionare e copiare come in Excel — e` il gesto con cui si porta
   * fuori un elenco da incollare in una mail o in un foglio. Prima i campi ACEA non erano nemmeno
   * celle: niente focus, niente selezione, niente Ctrl+C.
   *
   * L'ordine e` quello scelto dall'utente (le colonne si trascinano), quindi va passato: un
   * intervallo copiato deve uscire nell'ordine in cui si vede, non in quello di definizione.
   */
  colonneVisibili: ChiaveColonna[];
  /** Chiamata dopo un salvataggio andato a buon fine, per ricaricare i dati veri. */
  onSalvato: (operazioneId: string | null) => void;
  attivo: boolean;
};

/**
 * Griglia alla Excel sulla tabella: ci si muove ovunque, si scrive in due colonne.
 *
 * SELEZIONE E COPIA su tutte le colonne a schermo; SCRITTURA solo su Esecutore e Data pianificata.
 * I campi ACEA restano immutabili per principio — il registro e` lo specchio di ACEA — ma leggerli
 * e portarseli via e` un'altra cosa, e prima non si poteva: non essendo celle non avevano focus,
 * quindi niente selezione e niente Ctrl+C. Un incolla che cade su una colonna ACEA viene saltato
 * e detto, non applicato in silenzio.
 *
 * La persistenza è ottimistica con rollback: la cella mostra subito il valore nuovo, la scrittura
 * parte, e se fallisce il valore torna indietro con un avviso. In Excel si scrive e basta; qui
 * ogni cella è una chiamata di rete che può fallire, e l'utente deve vedere cosa non è passato.
 */
export function useEditingGriglia({ righe, operatori, colonneVisibili, onSalvato, attivo }: Props) {
  const [focus, setFocus] = useState<Cella | null>(null);
  const [selezione, setSelezione] = useState<Intervallo | null>(null);
  const [locali, setLocali] = useState<Map<string, ValoreLocale>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const righeRef = useRef(righe);
  righeRef.current = righe;

  const colonneRef = useRef(colonneVisibili);
  colonneRef.current = colonneVisibili;

  const limiti = useMemo(
    () => ({ righe: righe.length, colonne: colonneVisibili.length }),
    [righe.length, colonneVisibili.length],
  );

  /** `true` se su quella colonna si puo` SCRIVERE. Muoversi e copiare si puo` ovunque. */
  const editabile = useCallback(
    (chiave: string): chiave is ColonnaEditabile =>
      (COLONNE_EDITABILI as string[]).includes(chiave),
    [],
  );

  // Cambiano i dati (nuovo filtro, ricarica): le modifiche locali non hanno più senso.
  useEffect(() => { setLocali(new Map()); }, [righe]);

  const chiaveDi = useCallback((i: number) => {
    const r = righeRef.current[i];
    return r ? `${r.odl}|${r.numero_operazione}` : null;
  }, []);

  /** Applica le scritture: valida, mostra subito, poi salva. */
  const applica = useCallback(async (scritture: Array<{ riga: number; colonna: number; valore: string }>) => {
    if (scritture.length === 0) return;

    const perChiave = new Map<string, { staffId?: string; data?: string; nota?: string }>();
    const nuoviLocali = new Map(locali);
    const errori: string[] = [];

    let saltate = 0;
    for (const s of scritture) {
      const chiave = chiaveDi(s.riga);
      if (!chiave) continue;
      const colonna = colonneRef.current[s.colonna];
      // I campi ACEA non si scrivono: il registro e` il suo specchio. Si contano e si dicono,
      // invece di lasciar credere che l'incolla sia passato tutto.
      if (!colonna || !editabile(colonna)) {
        saltate += 1;
        continue;
      }
      if (colonna === 'note') {
        // Testo libero: nessuna validazione se non il taglio. Una nota e` un messaggio a chi va
        // sul posto, non un campo strutturato — l'unica cosa da impedire e` un incolla enorme che
        // renderebbe illeggibile il rapportino.
        const testo = s.valore.slice(0, MAX_NOTA);
        perChiave.set(chiave, { ...perChiave.get(chiave), nota: testo });
        nuoviLocali.set(chiave, { ...nuoviLocali.get(chiave), note: testo });
      } else if (colonna === 'pianificato_a') {
        const e = validaOperatore(s.valore, operatori);
        if (daSaltare(e)) continue;
        if (!e.ok) { errori.push(e.motivo); continue; }
        perChiave.set(chiave, { ...perChiave.get(chiave), staffId: e.valore });
        const nome = operatori.find((o) => o.id === e.valore)?.display_name ?? s.valore;
        nuoviLocali.set(chiave, { ...nuoviLocali.get(chiave), pianificato_a: nome });
      } else {
        const e = validaData(s.valore);
        if (daSaltare(e)) continue;
        if (!e.ok) { errori.push(e.motivo); continue; }
        perChiave.set(chiave, { ...perChiave.get(chiave), data: e.valore });
        nuoviLocali.set(chiave, { ...nuoviLocali.get(chiave), pianificato_il: e.valore });
      }
    }

    if (saltate > 0) {
      toast.info(
        `${saltate} ${saltate === 1 ? 'cella' : 'celle'} su colonne ACEA: non modificabili, saltate.`,
      );
    }
    if (errori.length > 0) {
      const unici = [...new Set(errori)];
      toast.error(unici.length > 2 ? `${unici.slice(0, 2).join('; ')} e altri ${unici.length - 2}` : unici.join('; '));
    }
    if (perChiave.size === 0) return;

    const precedenti = locali;
    setLocali(nuoviLocali);   // ottimistico: la cella mostra subito il valore nuovo
    setSalvando(true);
    try {
      const res = await fetch('/api/acea/celle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifiche: [...perChiave.entries()].map(([chiave, v]) => ({ chiave, ...v })),
        }),
      });
      const body = (await res.json()) as {
        operazioneId: string | null; creati: number; aggiornati: number;
        rifiutate: Array<{ chiave: string; motivo: string }>; error?: string;
      };
      if (!res.ok) {
        setLocali(precedenti);   // rollback: il valore torna com'era
        toast.error(body.error ?? 'Modifica non salvata.');
        return;
      }
      const tot = body.creati + body.aggiornati;
      if (tot > 0) toast.success(`${tot} ${tot === 1 ? 'riga aggiornata' : 'righe aggiornate'}`);
      if (body.rifiutate.length > 0) {
        const primi = body.rifiutate.slice(0, 2).map((r) => `${r.chiave.split('|')[0]} (${r.motivo})`);
        toast.info(
          body.rifiutate.length > 2
            ? `Non applicate: ${primi.join('; ')} e altre ${body.rifiutate.length - 2}`
            : `Non applicate: ${primi.join('; ')}`,
        );
      }
      onSalvato(body.operazioneId);
    } catch (e) {
      setLocali(precedenti);
      toast.error(e instanceof Error ? e.message : 'Modifica non salvata.');
    } finally {
      setSalvando(false);
    }
  }, [locali, operatori, chiaveDi, onSalvato, editabile]);

  /** Testo della selezione corrente, nel formato che Excel si aspetta (TAB + a capo). */
  const testoSelezione = useCallback((): string => {
    if (!selezione) return '';
    const n = normalizzaIntervallo(selezione);
    const out: string[] = [];
    for (let r = n.da.riga; r <= n.a.riga; r++) {
      const riga = righeRef.current[r];
      if (!riga) continue;
      const chiave = `${riga.odl}|${riga.numero_operazione}`;
      const loc = locali.get(chiave);
      const celle: string[] = [];
      for (let c = n.da.colonna; c <= n.a.colonna; c++) {
        const col = colonneRef.current[c];
        if (!col) continue;
        if (col === 'pianificato_a') celle.push(loc?.pianificato_a ?? riga.pianificato_a ?? '');
        else if (col === 'pianificato_il') celle.push(loc?.pianificato_il ?? riga.pianificato_il ?? '');
        else {
          // Le colonne ACEA escono con il testo che si VEDE — indirizzo composto, stato in
          // chiaro, date all'italiana — perche` e` quello che chi copia si aspetta di incollare.
          // Il trattino dei vuoti no: in un foglio va una cella vuota, non un carattere.
          const v = valoreCella(riga, col);
          celle.push(v === '—' ? '' : v);
        }
      }
      out.push(celle.join('\t'));
    }
    return out.join('\n');
  }, [selezione, locali]);

  /**
   * Tastiera e appunti sono globali — le celle non sono elementi focalizzabili, quindi l'ascolto
   * non può stare su di esse — ma si fermano sulla soglia di qualunque campo di testo.
   *
   * Senza questo filtro, con una cella selezionata la griglia si prendeva le frecce, il Ctrl+C e il
   * Ctrl+V di ogni campo della pagina: nella ricerca del registro il cursore non si muoveva, e un
   * incolla in un filtro di colonna finiva dentro la tabella.
   */
  useEffect(() => {
    if (!attivo || !focus) return;

    const tasti = (e: KeyboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const dirs: Record<string, 'su' | 'giu' | 'sinistra' | 'destra'> = {
        ArrowUp: 'su', ArrowDown: 'giu', ArrowLeft: 'sinistra', ArrowRight: 'destra',
      };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        const nuovo = spostaFocus(focus, dir, limiti);
        setFocus(nuovo);
        // Shift estende la selezione dall'ancora, come in Excel.
        setSelezione((s) => (e.shiftKey && s ? { da: s.da, a: nuovo } : { da: nuovo, a: nuovo }));
        return;
      }
      if (e.key === 'Escape') { setFocus(null); setSelezione(null); }
    };

    const copia = (e: ClipboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const testo = testoSelezione();
      if (!testo) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', testo);
    };

    const incolla = (e: ClipboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const testo = e.clipboardData?.getData('text/plain') ?? '';
      if (!testo) return;
      e.preventDefault();
      const blocco = parseBloccoIncollato(testo);
      const sel = selezione ?? { da: focus, a: focus };
      const esito = calcolaIncolla(blocco, sel, limiti);
      if (esito.righeIgnorate > 0) {
        toast.info(`${esito.righeIgnorate} righe incollate oltre la fine della tabella: ignorate`);
      }
      void applica(esito.scritture);
    };

    window.addEventListener('keydown', tasti);
    window.addEventListener('copy', copia);
    window.addEventListener('paste', incolla);
    return () => {
      window.removeEventListener('keydown', tasti);
      window.removeEventListener('copy', copia);
      window.removeEventListener('paste', incolla);
    };
  }, [attivo, focus, selezione, limiti, applica, testoSelezione]);

  const celleSelezionate = useMemo(() => {
    if (!selezione) return new Set<string>();
    return new Set(celleDi(selezione).map((c) => `${c.riga}:${c.colonna}`));
  }, [selezione]);

  const clickCella = useCallback((riga: number, colonna: number, shift: boolean) => {
    const c = { riga, colonna };
    setFocus(c);
    setSelezione((s) => (shift && s ? { da: s.da, a: c } : { da: c, a: c }));
  }, []);

  return {
    focus, selezione, celleSelezionate, locali, salvando,
    clickCella, applica, setFocus, editabile,
  };
}
