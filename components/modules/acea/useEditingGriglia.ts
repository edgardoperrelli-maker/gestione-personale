'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import {
  calcolaIncolla, celleDi, daSaltare, eventoDiUnCampo, normalizzaIntervallo, parseBloccoIncollato,
  spostaFocus, validaData, validaOperatore,
  type Cella, type ColonnaEditabile, type Intervallo,
} from '@/lib/acea/editingGriglia';
import { incollaSuRighe, testoRighe } from '@/lib/acea/righeAppunti';
import { MOTIVO_SOLO_ATTIVAZIONI, soloAttivazioni } from '@/lib/acea/giorniProgrammabili';
import { eRiapertura } from '@/lib/acea/scadenza';
import { valoreCella, type ChiaveColonna, type RigaTabella } from '@/lib/acea/colonneTabella';
import type { Famiglia } from '@/lib/acea/famiglia';

export type Operatore = {
  id: string;
  display_name: string;
  /** Territorio del cronoprogramma, quando c'è: serve a scegliere l'operatore più vicino. */
  territorio?: string | null;
};

/**
 * Quanto puo` essere lunga una nota.
 *
 * Non e` una regola di dominio, e` una difesa: incollare mezzo documento in una cella renderebbe
 * illeggibile il rapportino dell'operatore, che quella nota se la trova in cima alla card.
 */
export const MAX_NOTA = 500;

/** Quanto puo` essere lunga una matricola: una serigrafia di misuratore, non un testo libero. */
export const MAX_MATRICOLA_NUOVA = 100;

/** Colonne modificabili, nell'ordine in cui compaiono in tabella. */
export const COLONNE_EDITABILI: ColonnaEditabile[] = ['pianificato_a', 'pianificato_il', 'note', 'matricola_nuova'];

/** Valore mostrato in una cella modificabile, tenendo conto delle modifiche non ancora salvate. */
export type ValoreLocale = {
  pianificato_a?: string | null; pianificato_il?: string | null; note?: string | null;
  matricola_nuova?: string | null;
};

type Props = {
  righe: RigaTabella[];
  /**
   * Operatori su cui si risolve un nome incollato: gli ATTIVI, non quelli in cronoprogramma.
   *
   * Il vincolo «dev'essere in tabellone quel giorno» dipende dalla data su cui la riga andra` a
   * finire, che qui non si conosce — e imporlo avrebbe impedito di riassegnare un intervento
   * vecchio e non eseguito senza spostarlo di data. Lo applica il server, che la data ce l'ha. Il
   * menu della barra azioni resta invece limitato al cronoprogramma: li` il giorno si sceglie.
   */
  operatori: Operatore[];
  /**
   * «Oggi» secondo il SERVER (fuso Europe/Rome): da lì si calcola la finestra programmabile, e una
   * data fuori finestra viene rifiutata prima di partire.
   *
   * Vuoto finché la prima risposta non è arrivata: in quel caso il controllo resta spento e lo fa
   * il server — meglio un rifiuto un attimo più tardi che uno calcolato sull'orologio del browser,
   * che su un PC con la data sbagliata rifiuterebbe giorni buoni.
   */
  oggi?: string;
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
  /**
   * Indici delle righe SPUNTATE, in ordine di tabella.
   *
   * Sono le righe della colonna delle spunte, quella che finora serviva solo alla barra
   * «Pianifica». Da qui si copiano e ci si incolla sopra: e` la meta` che mancava.
   */
  righeSpuntate?: number[];
  /** Chiamata dopo un salvataggio andato a buon fine, per ricaricare i dati veri. */
  onSalvato: (operazioneId: string | null) => void;
  attivo: boolean;
  /** Famiglia della vista: il salvataggio deve scrivere sul registro giusto. */
  famiglia: Famiglia;
};

/**
 * Griglia alla Excel sulla tabella: ci si muove ovunque, si scrive in tre colonne.
 *
 * SELEZIONE E COPIA su tutte le colonne a schermo; SCRITTURA solo su Esecutore, Data pianificata e
 * Note. I campi ACEA restano immutabili per principio — il registro e` lo specchio di ACEA — ma
 * leggerli e portarseli via e` un'altra cosa, e prima non si poteva: non essendo celle non avevano
 * focus, quindi niente selezione e niente Ctrl+C. Un incolla che cade su una colonna ACEA viene
 * saltato e detto, non applicato in silenzio.
 *
 * Le RIGHE SPUNTATE sono il secondo bersaglio degli appunti, ed e` quello che toglie di mezzo la
 * barra di assegnazione: con delle righe spuntate, Ctrl+C copia quelle righe intere e Ctrl+V
 * scrive su tutte — un nome incollato su quaranta spunte le assegna tutte, senza aprire niente.
 *
 * La persistenza è ottimistica con rollback: la cella mostra subito il valore nuovo, la scrittura
 * parte, e se fallisce il valore torna indietro con un avviso. In Excel si scrive e basta; qui
 * ogni cella è una chiamata di rete che può fallire, e l'utente deve vedere cosa non è passato.
 */
export function useEditingGriglia({
  righe, operatori, oggi, colonneVisibili, righeSpuntate, onSalvato, attivo, famiglia,
}: Props) {
  const [focus, setFocus] = useState<Cella | null>(null);
  const [selezione, setSelezione] = useState<Intervallo | null>(null);
  const [locali, setLocali] = useState<Map<string, ValoreLocale>>(new Map());
  const [salvando, setSalvando] = useState(false);
  /**
   * Cella della Data pianificata con l'EDITOR aperto: un `<input type="date">` dentro la cella.
   *
   * L'incolla da Excel resta la via per i blocchi, ma una data singola si deve poter scrivere
   * anche a mano o scegliere dal calendario — prima l'unico modo di toccarne UNA era copiarla da
   * qualche parte, che per una cella sola è un giro assurdo.
   */
  const [editorData, setEditorData] = useState<Cella | null>(null);
  /**
   * Cella dell'Esecutore con il MENU aperto: una `<select>` dentro la cella.
   *
   * Su una cella vuota si apre al primo click, ed è l'UNICO modo di inserire un nome a mano:
   * niente testo libero — si sceglie fra chi è in cronoprogramma nei giorni a portata di mano
   * (i due pronti più quello scelto in barra), perché sono le sole persone a cui un ordine può
   * andare. L'incolla resta per i blocchi.
   */
  const [editorEsecutore, setEditorEsecutore] = useState<Cella | null>(null);
  /**
   * Cella di testo libero (Note o Matricola nuova) con l'EDITOR aperto: un `<input>` dentro la
   * cella, come per la Data e l'Esecutore.
   *
   * Senza questo, «scrivibile» voleva dire solo «ci si può incollare sopra»: selezionare la cella
   * e battere Ctrl+V funziona, ma digitare a mano — il gesto più ovvio, doppio click compreso —
   * non faceva niente, perché note e matricola nuova non avevano nessun editor come quelli sotto.
   */
  const [editorTesto, setEditorTesto] = useState<Cella | null>(null);
  const righeRef = useRef(righe);
  righeRef.current = righe;

  const colonneRef = useRef(colonneVisibili);
  colonneRef.current = colonneVisibili;

  const spuntate = useMemo(() => righeSpuntate ?? [], [righeSpuntate]);
  const spuntateRef = useRef(spuntate);
  spuntateRef.current = spuntate;

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

  /**
   * Dove finisce un incolla sulle righe spuntate quando nessuna cella ha il focus.
   *
   * L'Esecutore, se c'e`: e` la colonna che si incolla nel 90% dei casi, ed e` quella che rende
   * il gesto completo — si spuntano le righe e si incolla un nome, senza altri click.
   */
  const colonnaPredefinita = useMemo(() => {
    for (const chiave of COLONNE_EDITABILI) {
      const i = colonneVisibili.indexOf(chiave);
      if (i >= 0) return i;
    }
    return null;
  }, [colonneVisibili]);

  // Cambiano i dati (nuovo filtro, ricarica): le modifiche locali non hanno più senso, e
  // gli editor aperti starebbero su una riga che non è più quella.
  useEffect(() => {
    setLocali(new Map()); setEditorData(null); setEditorEsecutore(null); setEditorTesto(null);
  }, [righe]);

  const chiaveDi = useCallback((i: number) => {
    const r = righeRef.current[i];
    return r ? `${r.odl}|${r.numero_operazione}` : null;
  }, []);

  /** Applica le scritture: valida, mostra subito, poi salva. */
  const applica = useCallback(async (scritture: Array<{ riga: number; colonna: number; valore: string }>) => {
    if (scritture.length === 0) return;

    const perChiave = new Map<string, { staffId?: string; data?: string; nota?: string; matricolaNuova?: string }>();
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
      /*
        Le righe SENZA ordine non si scrivono, nemmeno sulle colonne nostre.

        Sono le limitazioni massive aperte a mano dal «+», che il registro mostra dalla vista
        unificata. Il salvataggio identifica la riga con (odl, numero_operazione) su `acea_ordini`:
        lì un ODL non c'e`, quindi la scrittura non avrebbe bersaglio. Si salta e si conta, come
        per le colonne di ACEA — un errore dopo il salvataggio sarebbe peggio, perche` il valore
        resterebbe a schermo come se fosse passato.
      */
      if (righeRef.current[s.riga]?.sola_lettura) {
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
      } else if (colonna === 'matricola_nuova') {
        // Anche qui testo libero — e` una matricola scritta o incollata dall'ufficio, non
        // scansionata: la stessa validazione «di forma» vivrebbe nel campo dell'operatore, non
        // in una correzione a posteriori.
        const testo = s.valore.slice(0, MAX_MATRICOLA_NUOVA);
        perChiave.set(chiave, { ...perChiave.get(chiave), matricolaNuova: testo });
        nuoviLocali.set(chiave, { ...nuoviLocali.get(chiave), matricola_nuova: testo });
      } else if (colonna === 'pianificato_a') {
        const e = validaOperatore(s.valore, operatori);
        if (daSaltare(e)) continue;
        if (!e.ok) { errori.push(e.motivo); continue; }
        perChiave.set(chiave, { ...perChiave.get(chiave), staffId: e.valore });
        const nome = operatori.find((o) => o.id === e.valore)?.display_name ?? s.valore;
        nuoviLocali.set(chiave, { ...nuoviLocali.get(chiave), pianificato_a: nome });
      } else {
        const e = validaData(s.valore, oggi);
        if (daSaltare(e)) continue;
        if (!e.ok) { errori.push(e.motivo); continue; }
        /*
          Venerdì e sabato il DUNNING manda solo le ATTIVAZIONI; le limitazioni MASSIVE sono
          esenti dalla regola (dec. 38) e passano.

          Il controllo si fa qui e non solo sul server perché su un incolla da Excel di duecento
          righe il server ne rifiuterebbe centonovanta, e l'esito sarebbe un elenco di rifiuti da
          leggere invece di una riga che dice cosa non va. Il codice SLA sta già nella riga: è la
          stessa definizione che decide la scadenza a un giorno (`eRiapertura`), non una copia —
          e la famiglia pure, la stessa che il server usa in `pianoPianificazione`.
        */
        if (soloAttivazioni(e.valore)) {
          const riga = righeRef.current[s.riga];
          if (riga?.famiglia !== 'massive' && !eRiapertura(riga?.codice_sla)) {
            errori.push(MOTIVO_SOLO_ATTIVAZIONI);
            continue;
          }
        }
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
          // La famiglia dice al server su QUALE registro scrivere note e appunti.
          famiglia,
        }),
      });
      const body = (await res.json()) as {
        operazioneId: string | null; creati: number; aggiornati: number;
        rifiutate: Array<{ chiave: string; motivo: string }>; bozze?: number; error?: string;
      };
      if (!res.ok) {
        setLocali(precedenti);   // rollback: il valore torna com'era
        toast.error(body.error ?? 'Modifica non salvata.');
        return;
      }
      const tot = body.creati + body.aggiornati;
      if (tot > 0) toast.success(`${tot} ${tot === 1 ? 'riga aggiornata' : 'righe aggiornate'}`);
      /*
        Le righe rimaste a metà si dicono a parte, e si dice cosa comporta.

        Sono scritte — non si è perso niente — ma non sono ancora lavoro: senza l'altra metà non
        esiste l'intervento, quindi non esiste il rapportino. Contarle insieme alle «righe
        aggiornate» le farebbe passare per pianificazione fatta.
      */
      const meta = body.bozze ?? 0;
      if (meta > 0) {
        toast.info(
          meta === 1
            ? '1 riga salvata a metà: senza esecutore e data non genera il rapportino.'
            : `${meta} righe salvate a metà: senza esecutore e data non generano il rapportino.`,
        );
      }
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
  }, [locali, operatori, oggi, chiaveDi, onSalvato, editabile, famiglia]);

  /**
   * Il testo di una cella come esce negli appunti.
   *
   * Le colonne ACEA escono con il testo che si VEDE — indirizzo composto, stato in chiaro, date
   * all'italiana — perche` e` quello che chi copia si aspetta di incollare. Il trattino dei vuoti
   * no: in un foglio va una cella vuota, non un carattere.
   */
  const valoreDaCopiare = useCallback((riga: number, colonna: string): string => {
    const r = righeRef.current[riga];
    if (!r) return '';
    const loc = locali.get(`${r.odl}|${r.numero_operazione}`);
    if (colonna === 'pianificato_a') return loc?.pianificato_a ?? r.pianificato_a ?? '';
    if (colonna === 'pianificato_il') return loc?.pianificato_il ?? r.pianificato_il ?? '';
    const v = valoreCella(r, colonna as ChiaveColonna);
    return v === '—' ? '' : v;
  }, [locali]);

  /** Testo della selezione di celle corrente, nel formato che Excel si aspetta (TAB + a capo). */
  const testoSelezione = useCallback((): string => {
    if (!selezione) return '';
    const n = normalizzaIntervallo(selezione);
    const indici: number[] = [];
    for (let r = n.da.riga; r <= n.a.riga; r++) indici.push(r);
    const colonne = colonneRef.current.slice(n.da.colonna, n.a.colonna + 1);
    return testoRighe(indici, colonne, valoreDaCopiare);
  }, [selezione, valoreDaCopiare]);

  /** Testo delle righe SPUNTATE: tutte le colonne a schermo, nell'ordine in cui si vedono. */
  const testoRigheSpuntate = useCallback(
    (): string => testoRighe(spuntate, colonneRef.current, valoreDaCopiare),
    [spuntate, valoreDaCopiare],
  );

  /**
   * Copia le righe spuntate negli appunti da un comando, non da Ctrl+C.
   *
   * Serve perche` la scorciatoia da sola non si trova: la barra dice «40 righe selezionate» e non
   * c'e` niente che dica che si possono portare via. `writeText` puo` fallire (permesso negato,
   * contesto non sicuro) e in quel caso lo si dice, invece di lasciare gli appunti com'erano.
   */
  const copiaRigheSpuntate = useCallback(async (): Promise<boolean> => {
    const testo = testoRigheSpuntate();
    if (!testo) return false;
    try {
      await navigator.clipboard.writeText(testo);
      const n = spuntateRef.current.length;
      toast.success(`${n} ${n === 1 ? 'riga copiata' : 'righe copiate'} negli appunti`);
      return true;
    } catch {
      toast.error('Copia non riuscita: usa Ctrl+C con le righe selezionate.');
      return false;
    }
  }, [testoRigheSpuntate]);

  /**
   * Tastiera e appunti sono globali — le celle non sono elementi focalizzabili, quindi l'ascolto
   * non può stare su di esse — ma si fermano sulla soglia di qualunque campo di testo.
   *
   * Senza questo filtro, con una cella selezionata la griglia si prendeva le frecce, il Ctrl+C e il
   * Ctrl+V di ogni campo della pagina: nella ricerca del registro il cursore non si muoveva, e un
   * incolla in un filtro di colonna finiva dentro la tabella.
   *
   * L'ascolto parte anche SENZA cursore di cella, se ci sono righe spuntate: chi spunta quaranta
   * righe e preme Ctrl+C non ha nessun motivo di aver cliccato prima una cella, e prima non
   * succedeva niente.
   */
  useEffect(() => {
    if (!attivo) return;
    if (!focus && spuntate.length === 0) return;

    const tasti = (e: KeyboardEvent) => {
      if (!focus) return;
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
      // Enter o F2 aprono l'editor della cella, come in Excel: il calendario sulla Data, il menu
      // degli operatori sull'Esecutore, l'input su Note e Matricola nuova. Sugli altri campi i
      // due tasti non fanno niente.
      if (e.key === 'Enter' || e.key === 'F2') {
        const chiave = colonneRef.current[focus.colonna];
        if (chiave === 'pianificato_il') {
          e.preventDefault();
          setEditorData(focus);
        } else if (chiave === 'pianificato_a') {
          e.preventDefault();
          setEditorEsecutore(focus);
        } else if (chiave === 'note' || chiave === 'matricola_nuova') {
          e.preventDefault();
          setEditorTesto(focus);
        }
        return;
      }
      if (e.key === 'Escape') { setFocus(null); setSelezione(null); }
    };

    const copia = (e: ClipboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      /*
        Nella COPIA il cursore di cella batte le spunte, ed è un cambio deciso.

        Prima vincevano sempre le spunte, e il flusso «spunto le righe, clicco la data buona,
        Ctrl+C, Ctrl+V» copiava le righe intere invece della data appena cliccata: l'incolla
        spargeva quaranta colonne dove doveva finire un giorno. Il cursore è il gesto più recente
        e più specifico — se hai appena cliccato una cella, è QUELLA che vuoi copiare. Le righe
        spuntate si copiano quando un cursore non c'è, o sempre col comando «Copia righe» in
        barra, che non è ambiguo per costruzione.

        L'INCOLLA resta alle spunte: là il bersaglio giusto sono le righe scelte, qualunque cella
        abbia il cursore — è il gesto con cui si assegna in blocco.
      */
      const testo = focus ? testoSelezione() : (spuntate.length > 0 ? testoRigheSpuntate() : '');
      if (!testo) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', testo);
    };

    const incolla = (e: ClipboardEvent) => {
      if (eventoDiUnCampo(e.target as HTMLElement | null)) return;
      const testo = e.clipboardData?.getData('text/plain') ?? '';
      if (!testo) return;
      const blocco = parseBloccoIncollato(testo);

      if (spuntate.length > 0) {
        const colonna = focus?.colonna ?? colonnaPredefinita;
        if (colonna === null) return;      // nessuna colonna scrivibile a schermo: niente da fare
        e.preventDefault();
        const esito = incollaSuRighe(blocco, spuntate, colonna, limiti);
        if (esito.righeIgnorate > 0) {
          toast.info(`${esito.righeIgnorate} righe incollate oltre le righe selezionate: ignorate`);
        }
        if (esito.righeNonCoperte > 0) {
          toast.info(`${esito.righeNonCoperte} righe selezionate senza dati nel blocco: lasciate com'erano`);
        }
        void applica(esito.scritture);
        return;
      }

      if (!focus) return;
      e.preventDefault();
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
  }, [
    attivo, focus, selezione, limiti, applica, testoSelezione,
    spuntate, testoRigheSpuntate, colonnaPredefinita,
  ]);

  const celleSelezionate = useMemo(() => {
    if (!selezione) return new Set<string>();
    return new Set(celleDi(selezione).map((c) => `${c.riga}:${c.colonna}`));
  }, [selezione]);

  const clickCella = useCallback((riga: number, colonna: number, shift: boolean) => {
    const c = { riga, colonna };
    setFocus(c);
    setSelezione((s) => (shift && s ? { da: s.da, a: c } : { da: c, a: c }));
  }, []);

  /** Apre l'editor SOLO sulla Data pianificata: le altre colonne non hanno un calendario. */
  const apriEditorData = useCallback((riga: number, colonna: number) => {
    if (colonneRef.current[colonna] !== 'pianificato_il') return;
    const c = { riga, colonna };
    setFocus(c);
    setSelezione({ da: c, a: c });
    setEditorData(c);
  }, []);

  const chiudiEditorData = useCallback(() => setEditorData(null), []);

  /** Conferma dell'editor: il valore ISO dell'input passa dalla stessa strada dell'incolla. */
  const confermaData = useCallback((riga: number, colonna: number, valore: string) => {
    setEditorData(null);
    if (valore) void applica([{ riga, colonna, valore }]);
  }, [applica]);

  /** L'ISO grezzo della data pianificata, per il `value` dell'input: la cella mostra dd/mm/yyyy. */
  const valoreIsoData = useCallback((riga: number): string => {
    const r = righeRef.current[riga];
    if (!r) return '';
    const loc = locali.get(`${r.odl}|${r.numero_operazione}`);
    return loc?.pianificato_il ?? r.pianificato_il ?? '';
  }, [locali]);

  /** Apre il menu SOLO sull'Esecutore: le altre colonne non hanno un elenco da cui scegliere. */
  const apriEditorEsecutore = useCallback((riga: number, colonna: number) => {
    if (colonneRef.current[colonna] !== 'pianificato_a') return;
    const c = { riga, colonna };
    setFocus(c);
    setSelezione({ da: c, a: c });
    setEditorEsecutore(c);
  }, []);

  const chiudiEditorEsecutore = useCallback(() => setEditorEsecutore(null), []);

  /**
   * Conferma del menu: il nome scelto passa dalla stessa strada dell'incolla.
   *
   * Si conferma col `display_name` e non con l'id: `applica` valida ogni scrittura con
   * `validaOperatore`, e un nome uscito dall'elenco risolve per corrispondenza esatta — così
   * menu, incolla e barra non possono divergere su chi è assegnabile.
   */
  const confermaEsecutore = useCallback((riga: number, colonna: number, nome: string) => {
    setEditorEsecutore(null);
    if (nome) void applica([{ riga, colonna, valore: nome }]);
  }, [applica]);

  /** Apre l'input SOLO su Note e Matricola nuova: le sole colonne di testo libero. */
  const apriEditorTesto = useCallback((riga: number, colonna: number) => {
    const chiave = colonneRef.current[colonna];
    if (chiave !== 'note' && chiave !== 'matricola_nuova') return;
    const c = { riga, colonna };
    setFocus(c);
    setSelezione({ da: c, a: c });
    setEditorTesto(c);
  }, []);

  const chiudiEditorTesto = useCallback(() => setEditorTesto(null), []);

  /**
   * Conferma dell'input di testo: passa dalla stessa strada dell'incolla, `applica` — che per
   * `note`/`matricola_nuova` non scarta la stringa vuota (a differenza di data e operatore): è
   * così che si CANCELLA una nota già scritta, non solo che se ne aggiunge una.
   */
  const confermaTesto = useCallback((riga: number, colonna: number, valore: string) => {
    setEditorTesto(null);
    void applica([{ riga, colonna, valore }]);
  }, [applica]);

  /** Il testo grezzo di Note/Matricola nuova, per il `defaultValue` dell'input. */
  const valoreTestoIniziale = useCallback((riga: number, colonna: number): string => {
    const r = righeRef.current[riga];
    if (!r) return '';
    const chiave = colonneRef.current[colonna];
    const loc = locali.get(`${r.odl}|${r.numero_operazione}`);
    if (chiave === 'note') return loc?.note ?? r.note ?? '';
    if (chiave === 'matricola_nuova') return loc?.matricola_nuova ?? r.matricola_nuova ?? '';
    return '';
  }, [locali]);

  return {
    focus, selezione, celleSelezionate, locali, salvando,
    clickCella, applica, setFocus, editabile, copiaRigheSpuntate,
    editorData, apriEditorData, chiudiEditorData, confermaData, valoreIsoData,
    editorEsecutore, apriEditorEsecutore, chiudiEditorEsecutore, confermaEsecutore,
    editorTesto, apriEditorTesto, chiudiEditorTesto, confermaTesto, valoreTestoIniziale,
  };
}
