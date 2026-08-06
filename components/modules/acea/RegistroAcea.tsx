'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { ClipboardList, Maximize2, Minimize2, RefreshCw, Upload } from 'lucide-react';
import Button from '@/components/Button';
import { toast } from '@/components/ui/Toast';
import {
  COLONNE_ACQUALATINA, COLONNE_DUNNING, COLONNE_MASSIVE, colonnePerStato, dataIt,
  type DefColonna, type RigaTabella,
} from '@/lib/acea/colonneTabella';
import { MAX_RIGHE_EXPORT, nomeFileExport, nomeFoglioExport } from '@/lib/acea/exportVista';
import { gruppiPerRapportino } from '@/lib/acea/caricaSuRapportino';
import { ATTIVITA_TABELLONE, type Famiglia } from '@/lib/acea/famiglia';
import { contaFiltriColonna } from '@/lib/acea/filtriOrdini';
import {
  eProgrammabile, limitiFinestra, type GiornoProgrammabile,
} from '@/lib/acea/giorniProgrammabili';
import { useEditingGriglia, type Operatore } from './useEditingGriglia';
import { useLayoutTabella } from './useLayoutTabella';
import TabellaOrdini, { chiaveRiga } from './TabellaOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';
import BarraAzioni from './BarraAzioni';
import GuidaTabella from './GuidaTabella';
import ModaleRapportini from './ModaleRapportini';
import MenuColonne from './MenuColonne';
import { caricaTutteLeRighe, esportaVista } from './esportaVista';
import { useOrdiniAcea } from './useOrdiniAcea';
import { numeroIt } from '@/utils/numero-it';

const numero = (n: number) => numeroIt(n);

const DEFINIZIONI: Record<Famiglia, DefColonna[]> = {
  dunning: COLONNE_DUNNING,
  massive: COLONNE_MASSIVE,
  acqualatina: COLONNE_ACQUALATINA,
};

const TITOLI: Record<Famiglia, string> = {
  dunning: 'Dunning',
  massive: 'Limitazioni massive',
  acqualatina: 'Sostituzione misuratori',
};

/** Registro ordini con filtri, tabella virtualizzata e selezione. Condiviso dalle tre famiglie. */
export default function RegistroAcea({ famiglia, comuniIniziali = [] }: {
  famiglia: Famiglia;
  /**
   * Le schede-comune al primo render (solo massive), lette dal server nella pagina: devono
   * esistere PRIMA della prima risposta, o la prima interrogazione partirebbe senza scheda.
   */
  comuniIniziali?: string[];
}) {
  const definizione: DefColonna[] = DEFINIZIONI[famiglia];
  /** Come si chiama, nei messaggi, l'attività di tabellone che rende assegnabili in questa vista. */
  const etichettaAttivita = ATTIVITA_TABELLONE[famiglia].etichetta;
  // `colonne` è la definizione RIORDINATA come l'ha lasciata l'utente. Da qui in giù nessuno deve
  // più preoccuparsi dell'ordine: tabella, pill dei filtri, menu colonne ed export leggono questa.
  const { ordinate: colonne, personalizzato, azzera, comandi } = useLayoutTabella(famiglia, definizione);
  const [visibili, setVisibili] = useState<Set<string>>(
    () => new Set(definizione.filter((c) => c.predefinita).map((c) => c.chiave)),
  );
  const [selezione, setSelezione] = useState<RowSelectionState>({});
  const [esportando, setEsportando] = useState(false);
  const [scaricate, setScaricate] = useState(0);
  const [ingrandita, setIngrandita] = useState(false);
  /** La modale dei rapportini: l'unica via dal registro, si sovrappone e la selezione resta. */
  const [rapportiniAperti, setRapportiniAperti] = useState(false);
  /** Sync dal master (solo acqualatina): il registro si alimenta da lì, non da un export ACEA. */

  const {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni, altre, tutteCaricate,
    ricarica, perPagina, query, riapertureSenzaData, comuniMassive,
  } = useOrdiniAcea(famiglia, comuniIniziali);

  /*
    Le colonne ADATTATE alla scheda: nella «Sostituzione saracinesca» l'ODL che conta e` quello
    dell'ordine di sostituzione, e il numero della limitazione — chiuso da mesi — smette di
    chiamarsi «ODL». Era quello a ingannare: si leggeva la prima colonna credendo di leggere la
    sostituzione.
  */
  const colonneVista = useMemo(
    () => colonnePerStato(colonne, filtri.stato === 'saracinesche'),
    [colonne, filtri.stato],
  );

  const colonneVisibili = useMemo(
    () => colonneVista.filter((c) => visibili.has(c.chiave)),
    [colonneVista, visibili],
  );

  const selezionate: RigaTabella[] = useMemo(
    () => righe.filter((r) => selezione[chiaveRiga(r)]),
    [righe, selezione],
  );

  /*
    Chi si può programmare, e quando.

    L'elenco NON è più l'anagrafica del personale: sono i nomi che il Cronoprogramma porta in
    tabellone per il giorno scelto. Chi programma ACEA la mattina deve vedere le persone che quel
    giorno ci sono davvero — l'elenco completo degli attivi conteneva anche chi è in ferie e chi
    sta su un'altra commessa, e non c'era modo di distinguerli se non chiedendo. «Oggi» lo decide
    il server, in fuso Europe/Rome: con l'orologio del browser un PC con la data sbagliata
    proporrebbe giorni che il server poi rifiuta.

    `giorni` sono quelli PRONTI (oggi e il prossimo lavorativo), che arrivano già col loro
    tabellone; la finestra però è più larga — due settimane, dec. 49 — e il giorno scelto dal
    campo data si aggiunge qui quando il suo tabellone torna.
  */
  const [giorni, setGiorni] = useState<GiornoProgrammabile[]>([]);
  const [operatoriPerGiorno, setOperatoriPerGiorno] = useState<Record<string, Operatore[]>>({});
  const [giorno, setGiorno] = useState('');
  /** `true` mentre si legge il tabellone di un giorno che non era fra quelli pronti. */
  const [caricandoOperatori, setCaricandoOperatori] = useState(false);
  /*
    Gli operatori ATTIVI, che sono quelli su cui la griglia risolve un nome incollato.

    Non è una svista che siano diversi da quelli del menu: il menu sceglie un giorno, quindi può
    limitarsi al tabellone di quel giorno; la griglia no — un intervento vecchio e non eseguito si
    deve poter riassegnare senza spostarlo, e il cronoprogramma di un giorno passato non ha nessuna
    autorità su chi ci va adesso. Il controllo giorno per giorno lo fa il server, che la data ce l'ha.
  */
  const [operatoriTutti, setOperatoriTutti] = useState<Operatore[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        // La famiglia decide il filtro degli assegnabili: qui le massive vedono chi fa le
        // massive, non la squadra del dunning.
        const res = await fetch(`/api/acea/operatori?famiglia=${famiglia}`);
        if (!res.ok || !vivo) return;
        const body = (await res.json()) as {
          oggi: string;
          giorni: Array<GiornoProgrammabile & { operatori: Operatore[] }>;
        };
        const elenco = body.giorni ?? [];
        // Gli operatori escono dal giorno e vanno nella mappa: `giorni` descrive i giorni e
        // basta, così passarlo alla griglia non si porta dietro due elenchi di nomi.
        setGiorni(elenco.map((g) => ({
          data: g.data, etichetta: g.etichetta, esteso: g.esteso, soloAttivazioni: g.soloAttivazioni,
        })));
        setOperatoriPerGiorno(Object.fromEntries(elenco.map((g) => [g.data, g.operatori])));
        // Il giorno scelto si imposta una volta sola: se l'utente ha già scelto il lunedì e nel
        // frattempo qualcosa ricarica il tabellone, riportarlo a oggi gli cambierebbe il bersaglio
        // sotto le mani. Si tiene finché è programmabile, non solo se è fra i giorni pronti.
        setGiorno((g) => (
          g && eProgrammabile(g, body.oggi) ? g : (elenco[0]?.data ?? '')
        ));
      } catch {
        /* senza finestra l'assegnazione resta ferma, ma la tabella si legge e si copia lo stesso */
      }
    })();
    return () => { vivo = false; };
  }, [famiglia]);

  /*
    Il tabellone di un giorno scelto dal campo data, chiesto quando serve.

    I giorni pronti sono due; la finestra ne contiene una quindicina, e leggerli tutti in anticipo
    sarebbe lavoro speso su giorni che quasi nessuna mattina si guardano. Il giorno scelto entra
    nella mappa (anche vuoto: senza, si richiederebbe a ogni render) e nell'elenco dei giorni, così
    lo vede anche il menu dell'Esecutore in cella.
  */
  useEffect(() => {
    if (!giorno || operatoriPerGiorno[giorno] !== undefined) return;
    let vivo = true;
    setCaricandoOperatori(true);
    void (async () => {
      try {
        const res = await fetch(`/api/acea/operatori?famiglia=${famiglia}&data=${giorno}`);
        if (!res.ok || !vivo) return;
        const body = (await res.json()) as {
          giorni: Array<GiornoProgrammabile & { operatori: Operatore[] }>;
        };
        const scelto = (body.giorni ?? []).find((g) => g.data === giorno);
        if (!vivo) return;
        setOperatoriPerGiorno((m) => ({ ...m, [giorno]: scelto?.operatori ?? [] }));
        if (!scelto) return;
        setGiorni((elenco) => (
          elenco.some((g) => g.data === scelto.data)
            ? elenco
            : [...elenco, {
              data: scelto.data, etichetta: scelto.etichetta, esteso: scelto.esteso,
              soloAttivazioni: scelto.soloAttivazioni,
            }].sort((a, b) => a.data.localeCompare(b.data))
        ));
      } catch {
        /* niente nomi per quel giorno: la barra lo dice, la tabella resta viva */
      } finally {
        if (vivo) setCaricandoOperatori(false);
      }
    })();
    return () => { vivo = false; };
  }, [giorno, famiglia, operatoriPerGiorno]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/admin/personale');
        if (!res.ok || !vivo) return;
        const body = (await res.json()) as { rows?: Operatore[] } | Operatore[];
        const rows = Array.isArray(body) ? body : (body.rows ?? []);
        setOperatoriTutti(rows.filter((r) => r.id && r.display_name));
      } catch {
        /* senza anagrafica il rifiuto resta «operatore non trovato»: meno preciso, non sbagliato */
      }
    })();
    return () => { vivo = false; };
  }, []);

  /** Le spunte raggruppate per (esecutore, giorno): il piano del bottone «Sul rapportino». */
  const pianoCarico = useMemo(
    () => gruppiPerRapportino(selezionate, operatoriTutti),
    [selezionate, operatoriTutti],
  );

  /** Assegnabili nel giorno scelto: è questo elenco che finisce nel menu della barra azioni. */
  const operatoriDelGiorno = useMemo(
    () => operatoriPerGiorno[giorno] ?? [],
    [operatoriPerGiorno, giorno],
  );

  /** Indici delle righe spuntate, in ordine di tabella: è il bersaglio di copia e incolla. */
  const righeSpuntate = useMemo(
    () => righe.reduce<number[]>((acc, r, i) => {
      if (selezione[chiaveRiga(r)]) acc.push(i);
      return acc;
    }, []),
    [righe, selezione],
  );

  // `onSalvato: ricarica` e non `() => ricarica()`: una lambda nuova a ogni render fa riregistrare
  // i tre listener globali di `useEditingGriglia` a ogni battuta.
  const chiaviVisibili = useMemo(() => colonneVisibili.map((c) => c.chiave), [colonneVisibili]);
  const editing = useEditingGriglia({
    righe,
    operatori: operatoriTutti,
    oggi,
    righeSpuntate,
    colonneVisibili: chiaviVisibili,
    onSalvato: ricarica,
    attivo: true,
    famiglia,
  });

  /**
   * La posizione della colonna nella griglia: ORA e` la posizione a schermo, per tutte.
   *
   * Prima era l'indice fra le sole due modificabili, e i campi ACEA non avevano cella: niente
   * focus, niente selezione, niente copia. Ora ci si muove ovunque e si copia ovunque — a
   * scrivere restano solo Esecutore e Data.
   */
  const indiceColonna = useCallback(
    (chiave: string) => {
      const i = chiaviVisibili.indexOf(chiave as (typeof chiaviVisibili)[number]);
      return i >= 0 ? i : null;
    },
    [chiaviVisibili],
  );

  /** Valore non ancora confermato dal server, mostrato in corsivo finché non si ricarica. */
  const valoreLocale = useCallback((r: RigaTabella, chiave: string): string | null => {
    const loc = editing.locali.get(`${r.odl}|${r.numero_operazione}`);
    if (!loc) return null;
    if (chiave === 'note') return loc.note ?? null;
    if (chiave === 'matricola_nuova') return loc.matricola_nuova ?? null;
    if (chiave === 'pianificato_a') return loc.pianificato_a ?? null;
    if (chiave === 'pianificato_il') return loc.pianificato_il ? dataIt(loc.pianificato_il) : null;
    return null;
  }, [editing.locali]);

  /*
    Vista ingrandita.

    Non è la Fullscreen API del browser, ed è una scelta: in fullscreen nativo viene disegnato solo
    il sottoalbero dell'elemento a schermo pieno, e i filtri di colonna (portale su `document.body`),
    i toast e le conferme vivono TUTTI fuori da quel sottoalbero. Ne uscirebbe una tabella grande
    con gli imbuti morti e i messaggi invisibili — l'opposto di quello che serve. Un riquadro
    `fixed inset-0` resta invece dentro il documento: sopra ci si posano ancora popover (z-50),
    conferme (z-50) e toast (z-90), e sotto restano testa e sidebar (z-40). La mappa può permettersi
    il fullscreen nativo perché non ha nulla in portale.

    ⚠️ Il `fixed` si riferisce al viewport solo se NESSUN antenato ha `transform`, `filter`,
    `perspective`, `contain` o `will-change`: un antenato trasformato diventa lui il riferimento e
    il riquadro coprirebbe la sola area del contenuto, lasciando fuori sidebar e testa. Qui sopra
    c'è `PageTransitionWrapper` (`app/hub/layout.tsx`), che anima `y: 6 → 0`. Verificato nel
    sorgente di `motion-dom` (`buildTransform`): a valori di default restituisce la stringa `none`,
    e `transform: none` non crea containing block. Vale finché quella transizione resta su valori
    che tornano a zero — se un domani ci si mette uno `scale` a riposo, questo riquadro si rompe.
  */
  useEffect(() => {
    if (!ingrandita) return undefined;
    const precedente = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    /*
      La cromatura coperta diventa `inert`: il riquadro copre sidebar e TopBar (z-45 sopra il
      loro z-40) ma senza inert restavano TABBABILI — il giro di Tab finiva su comandi
      invisibili, e il lettore di schermo li leggeva come se la pagina fosse ancora lì.
      `inert` toglie in un colpo focus e albero accessibile; al rientro si rimette com'era.
      Si marca la cromatura della SHELL (nav e header), non i fratelli del riquadro: i portali
      di filtri, conferme e toast montano su body e devono restare vivi.
    */
    const cromatura = Array.from(document.querySelectorAll<HTMLElement>('nav, header'));
    for (const el of cromatura) el.inert = true;
    return () => {
      document.body.style.overflow = precedente;
      for (const el of cromatura) el.inert = false;
    };
  }, [ingrandita]);

  const cursoreAttivo = editing.focus !== null;
  useEffect(() => {
    if (!ingrandita) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Quell'Esc è di chi lo sta già usando: il cursore di cella per uscire dalla griglia, il
      // pannello di un filtro per chiudersi (che ferma la propagazione prima di arrivare qui).
      if (cursoreAttivo) return;
      setIngrandita(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ingrandita, cursoreAttivo]);

  /**
   * Export della vista.
   *
   * «Vista» sono i filtri, non la finestra di paginazione: chi ha davanti «300 di 5.293» e clicca
   * Esporta si aspetta 5.293 righe. Prima ne usciva un file da 300, senza niente che lo dicesse —
   * e un xlsx troncato in silenzio è peggio di un export che manca, perché ci si contano sopra le
   * righe. Quindi si ripercorre la stessa query fino in fondo; se le righe sono già tutte in
   * memoria si usa quello che c'è, senza rifare undici richieste.
   */
  const esporta = useCallback(async () => {
    if (totale > MAX_RIGHE_EXPORT) {
      toast.error(
        `La vista ha ${numero(totale)} righe: l'export ne regge ${numero(MAX_RIGHE_EXPORT)}. Restringi i filtri.`,
      );
      return;
    }
    setEsportando(true);
    setScaricate(tutteCaricate ? righe.length : 0);
    try {
      const tutte = tutteCaricate ? righe : await caricaTutteLeRighe(query, totale, setScaricate);
      await esportaVista(
        tutte,
        colonneVisibili,
        nomeFileExport({
          famiglia,
          stato: filtri.stato,
          // La scheda-comune restringe il contenuto quanto lo stato: il file deve dirlo.
          comune: filtri.comuneScheda,
          oggi,
          filtrato: contaFiltriColonna(filtri) > 0 || filtri.cerca.trim() !== '',
        }),
        nomeFoglioExport(famiglia),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export non riuscito.');
    } finally {
      setEsportando(false);
    }
  }, [righe, tutteCaricate, query, totale, colonneVisibili, famiglia, filtri, oggi]);

  if (errore) {
    /*
      Token di stato, non di superficie: `--brand-surface-muted` vale esattamente quanto
      `--brand-bg` nel tema chiaro e questo blocco vive sul canvas, quindi il riquadro non si
      vedeva — restava un testo a mezz'aria proprio nello stato peggiore della vista.

      Il testo diceva «se il registro è vuoto, carica un export»: una causa impossibile. Questo
      ramo si raggiunge solo se la lettura fallisce (500, o 401/403); un registro vuoto torna 200
      con `righe: []` e finisce nello stato vuoto della tabella, non qui. E siccome l'early return
      toglie di mezzo ogni comando della vista, senza «Riprova» l'unica via d'uscita era ricaricare
      la pagina a mano.
    */
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-4"
      >
        <p className="text-sm text-[var(--brand-text-main)]">{errore}</p>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          La lettura del registro non è riuscita. Se si ripete, il problema è sul server: il
          registro resta com&apos;è, non è andato perso nulla.
        </p>
        <Button variant="outline" size="sm" onClick={ricarica} loading={caricando} className="mt-3">
          <RefreshCw size={14} aria-hidden="true" />
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        ingrandita
          // `z-[45]`: sopra la testa della shell (z-40), sotto tutto ciò che deve poter comparire
          // SOPRA la tabella — pannelli dei filtri e conferme (z-50), palette (z-70), toast (z-90).
          ? 'fixed inset-0 z-[45] flex flex-col gap-2 bg-[var(--brand-bg)] p-3'
          // In pagina è l'anello finale della catena flex che parte da `h-[calc(100dvh-6rem)]`:
          // la tabella qui sotto prende l'altezza che avanza invece di scontarla da sé.
          : 'flex min-h-0 flex-1 flex-col gap-2'
      }
    >
      {/*
        Ingrandita, la tabella copre la testa di pagina e la sidebar: senza una riga di identità si
        resta davanti a una griglia di numeri senza sapere di che vista è. Non è una testa di
        modulo (DESIGN.md §3 — quella è l'`ObjectHeader` della pagina, che qui è coperto): è
        l'etichetta di uno stato temporaneo, e dice anche come uscirne.
      */}
      {ingrandita && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">
            {TITOLI[famiglia]} — registro ordini
          </h2>
          <span className="text-xs text-[var(--brand-text-muted)]">
            <kbd>Esc</kbd> per tornare alla pagina
          </span>
        </div>
      )}

      <BarraFiltriAcea
        filtri={filtri}
        onChange={setFiltri}
        colonne={colonneVista}
        totale={totale}
        caricate={righe.length}
        // In massive la barra non disegna proprio la scheda Riaperture, quindi il gating del
        // triangolo e` una seconda rete: se un domani la scheda tornasse, il numero — che conta
        // ordini di dunning — non comparirebbe comunque sulla vista sbagliata.
        famiglia={famiglia}
        comuni={comuniMassive}
        riapertureSenzaData={famiglia === 'dunning' ? riapertureSenzaData : null}
      />

      {/*
        UNA RIGA SOLA, E UN GRUPPO DI COMANDI ALLA VOLTA.

        Il commento qui sopra diceva che alla prima spunta la pagina non si muoveva di un pixel.
        Non era vero, e il modo in cui non lo era spiega perché: l'altezza dei singoli comandi
        c'entrava poco, a mandare la tabella più in basso era il `flex-wrap`. Comandi della vista
        e barra azioni convivevano sulla stessa riga, e appena la barra si riempiva — l'operatore,
        la data, Pianifica, Copia, Deseleziona, l'avviso e «Annulla ultima (n righe → NOME)» — i
        due gruppi non ci stavano più: uno andava a capo e il registro scendeva di una riga
        INTERA. Peggio, «Annulla ultima» sopravvive alla deselezione (BarraAzioni si smonta solo
        se non ha nemmeno quello), quindi dopo la prima pianificazione la riga in più restava lì.

        Misurato prima: a 1280px basta UNA spunta perché la riga passi da 36 a 44px; con la barra
        piena il salto è una riga di tabella. Il dato si sposta sotto il mouse nel momento esatto
        in cui lo si sta mirando — che è il gesto centrale di questa pagina.

        Ora i due gruppi si danno il cambio invece di sommarsi: sono due MODI dello stesso
        strumento, non due strumenti. Senza selezione si guarda, si filtra, si esporta; con una
        selezione si assegna. Restano «Rapportini» e «Ingrandisci», i comandi della vista che
        servono MENTRE si seleziona — il primo lavora proprio sulle righe spuntate (vedi il suo
        commento); gli altri servono prima o dopo, e tornano alla deselezione.
      */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {selezionate.length === 0 && (
            <span className="text-xs text-[var(--brand-text-muted)]">
              Seleziona le righe cliccandole (shift-click per un intervallo): da lì si pianifica
              e si copia
            </span>
          )}
        </div>
        {/*
          `[&>*]:shrink-0`: NESSUN comando si lascia schiacciare. Quando la barra azioni compare
          con la selezione, il flex provava a far stare tutto su una riga comprimendo i bottoni —
          «Importa export» e «Esporta vista» finivano su due righe e la riga cresceva comunque.
          Con lo shrink spento i comandi tengono la loro misura; se lo spazio davvero non basta,
          il `flex-wrap` manda a capo un comando INTERO (caso limite di schermi stretti).
        */}
        <div className="flex flex-wrap items-center gap-2 [&>*]:shrink-0">
          {/* L'indicatore visibile del salvataggio: stava nel paragrafo-guida rimosso, e a chi
              scrive in griglia serve ancora un segno che la scrittura è in viaggio. */}
          {editing.salvando && (
            <span className="text-xs italic text-[var(--brand-text-muted)]">salvataggio…</span>
          )}
          {/*
            L'import resta una scorciatoia agli Strumenti (`<a>`: e` una navigazione, apribile in
            scheda nuova senza perdere la tabella). «Rapportini» invece NON naviga piu`: apre la
            modale qui sopra la pagina — la selezione resta dov'e`, e la funzione e` UNA (via il
            vecchio collegamento agli Strumenti e il bottone «Sul rapportino» in barra: tre vie
            per la stessa cosa erano due di troppo).
          */}
          {/* Comandi del MODO VISTA: si ritirano quando c'è una selezione (vedi la testa della riga). */}
          {selezionate.length === 0 && (
            /*
              Lo STESSO gesto su tutte e due le famiglie (decisione utente 04/08: via «Aggiorna
              dal master», che chiedeva un file già caricato altrove): «Importa export» porta
              alla card di import degli Strumenti della commessa, dove si carica il file del
              committente e il registro si allinea in un colpo — cambia solo il file che ci si
              carica (l'export ACEA di là, il master/battente AcquaLatina di qua).

              Unico comando della riga a non passare dal primitivo, perche' e` un `<a>` e
              `Button` rende solo `<button>`. Le classi ricalcano `Button variant="outline"
              size="sm"` e vanno tenute allineate a quelle: `px-3` e `gap-2` come il
              primitivo, non `px-2.5` e `gap-1.5` — con quelli era 2px per lato piu` stretto
              dei vicini identici.
            */
            <a
              href={famiglia === 'acqualatina' ? '/hub/acqualatina/strumenti#import' : '/hub/acea/strumenti#import'}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs font-medium text-[var(--brand-text-main)] transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              <Upload size={14} aria-hidden="true" />
              Importa export
            </a>
          )}

          {/*
            «Rapportini» NON si ritira con gli altri comandi della vista: la sua modale lavora
            PROPRIO sulle righe spuntate — le carica sui rapportini di chi le esegue — e chiuso
            nel modo vista spariva nel momento esatto in cui serviva, senza altra via (il vecchio
            «Sul rapportino» in barra azioni non esiste piu`). Resta in entrambi i modi: da vuoto
            la modale spiega da sola che righe selezionare.
          */}
          {/*
            IN SELEZIONE PERDE LA PAROLA, non il posto. È lo scambio fra i due modi: le parole
            vanno dove serve leggerle — nella barra azioni, che è quella che si sta usando — e i
            comandi della vista si stringono a icona per farle stare sulla stessa riga. Restano
            raggiungibili con un click e col tooltip; alla deselezione tornano scritti.
          */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRapportiniAperti(true)}
            aria-label={selezionate.length > 0 ? 'Rapportini' : undefined}
            title={selezionate.length > 0 ? 'Carica le righe spuntate sui rapportini' : undefined}
          >
            <ClipboardList size={14} aria-hidden="true" />
            {selezionate.length === 0 && 'Rapportini'}
          </Button>

          {/*
            Il comando sta DENTRO il riquadro ingrandito, non nella pagina sotto: cliccandolo il
            focus gli resta addosso in entrambi gli stati, quindi non serve spostarlo a mano né
            riportarlo indietro all'uscita.

            Niente `aria-pressed`: l'etichetta cambia e dice già cosa farà il prossimo click, e
            sommare le due cose fa annunciare «Riduci, premuto», che si contraddice.
          */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIngrandita((v) => !v)}
            /* In selezione resta l'icona sola (vedi «Rapportini» qui sopra): l'etichetta
               accessibile continua a dire quale dei due gesti farà il prossimo click. */
            aria-label={selezionate.length > 0 ? (ingrandita ? 'Riduci' : 'Ingrandisci') : undefined}
            title={selezionate.length > 0 ? (ingrandita ? 'Riduci' : 'Ingrandisci') : undefined}
          >
            {ingrandita
              ? <Minimize2 size={14} aria-hidden="true" />
              : <Maximize2 size={14} aria-hidden="true" />}
            {selezionate.length === 0 && (ingrandita ? 'Riduci' : 'Ingrandisci')}
          </Button>

          {/*
            Colonne ed «Esporta vista» restano anche in selezione, per richiesta dell'ufficio:
            capita di cambiare le colonne visibili con delle righe gia` spuntate, e perderle
            costringeva a deselezionare e ricominciare.

            Il rischio e` il `flex-wrap` di cui sopra — e` il gruppo piu` largo della riga — ed e`
            per questo che l'etichetta si accorcia a «Colonne (15)» quando c'e` una selezione:
            «Colonne: 15 selezionati» accanto alla barra azioni piena mandava la riga a capo su
            uno schermo da 1280, cioe` esattamente il salto che questa riga esiste per evitare.
          */}
          <MenuColonne
            colonne={colonneVista}
            visibili={visibili}
            onChange={setVisibili}
            onEsporta={() => void esporta()}
            esportando={esportando}
            vuota={totale === 0}
            compatto={selezionate.length > 0}
            onAzzeraLayout={personalizzato ? azzera : undefined}
            nota={
              esportando && !tutteCaricate
                ? `${numero(scaricate)} di ${numero(totale)} righe`
                : undefined
            }
          />

          {/*
            Il «?» resta del modo vista: la guida si legge prima, non con le righe spuntate.
            (Risoluzione del merge: da main arriva il contratto nuovo — `oggi` dal server, la
            finestra la deriva la guida — dal branch il gating sulla selezione. Servono entrambi.)
          */}
          {selezionate.length === 0 && <GuidaTabella oggi={oggi} famiglia={famiglia} />}

          {/*
            Sempre montata: tiene in vita l'annullamento dell'ultima pianificazione, che vive nel
            suo stato interno e sparirebbe smontandola alla deselezione — proprio quando serve.
            Si nasconde da sola quando non ha niente da dire.
          */}
          <BarraAzioni
            famiglia={famiglia}
            chiavi={selezionate.map(chiaveRiga)}
            onAnnullaSelezione={() => setSelezione({})}
            onPianificato={ricarica}
            operatori={operatoriDelGiorno}
            oggi={oggi}
            giorno={giorno}
            onGiorno={setGiorno}
            caricandoOperatori={caricandoOperatori}
            onCopiaRighe={editing.copiaRigheSpuntate}
          />
        </div>
      </div>

      <ModaleRapportini
        aperta={rapportiniAperti}
        onChiudi={() => setRapportiniAperti(false)}
        pianoCarico={pianoCarico}
        selezionate={selezionate.length}
        onCaricato={ricarica}
        famiglia={famiglia}
      />

      <TabellaOrdini
        righe={righe}
        colonne={colonneVista}
        colonneVisibili={visibili}
        oggi={oggi}
        selezione={selezione}
        onSelezione={setSelezione}
        caricando={caricando}
        filtri={filtri}
        onFiltri={setFiltri}
        opzioni={opzioni}
        comandiColonne={comandi}
        editing={{
          indiceColonna,
          editabile: editing.editabile,
          focus: editing.focus,
          celleSelezionate: editing.celleSelezionate,
          valoreLocale,
          onClickCella: editing.clickCella,
          editorData: editing.editorData,
          onApriEditorData: editing.apriEditorData,
          onChiudiEditorData: editing.chiudiEditorData,
          onConfermaData: editing.confermaData,
          valoreIsoData: editing.valoreIsoData,
          editorEsecutore: editing.editorEsecutore,
          onApriEditorEsecutore: editing.apriEditorEsecutore,
          onChiudiEditorEsecutore: editing.chiudiEditorEsecutore,
          onConfermaEsecutore: editing.confermaEsecutore,
          editorTesto: editing.editorTesto,
          onApriEditorTesto: editing.apriEditorTesto,
          onChiudiEditorTesto: editing.chiudiEditorTesto,
          onConfermaTesto: editing.confermaTesto,
          valoreTestoIniziale: editing.valoreTestoIniziale,
          // Le voci del menu in cella: chi è in cronoprogramma, giorno per giorno della finestra.
          operatoriFinestra: giorni.map((g) => ({
            ...g, operatori: operatoriPerGiorno[g.data] ?? [],
          })),
          // Per lo stato vuoto del menu: quale attività manca in tabellone, detta col suo nome.
          etichettaAttivita,
          // I confini del calendario sono gli estremi della finestra. Le domeniche in mezzo
          // restano cliccabili nel picker (min/max non sanno bucare), ma la validazione le
          // rifiuta col motivo — meglio un rifiuto spiegato che un calendario che sembra rotto.
          finestraData: limitiFinestra(oggi) ?? undefined,
        }}
      />

      {/*
        La guida non sta più qui sotto: era un paragrafo che cresceva a ogni funzione e si è
        mangiato tre righe di registro. Ora vive nella modale del «?» in barra (GuidaTabella),
        e la tabella si riprende la piega.
      */}

      {/*
        Regione live, solo per i lettori di schermo: a chi vede, conteggio e selezione sono già
        scritti nella barra sopra la tabella, e ripeterli qui sarebbe rumore.

        `role="status"` (che implica `aria-live="polite"`) montato SEMPRE, anche a contenuto vuoto:
        una regione live inserita nel DOM nello stesso momento del testo spesso non viene
        annunciata, perché il lettore deve già osservarla quando il contenuto cambia.
      */}
      <p role="status" className="sr-only">
        {editing.salvando && 'Salvataggio in corso…'}
        {!editing.salvando && esportando && `Export in corso: ${scaricate} righe di ${totale}.`}
        {!editing.salvando && !esportando
          && `${righe.length} righe caricate su ${totale}${selezionate.length > 0 ? `, ${selezionate.length} selezionate` : ''}.`}
      </p>

      {!tutteCaricate && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={altre} loading={caricando}>
            Carica altre {Math.min(perPagina, totale - righe.length)} righe
          </Button>
        </div>
      )}
    </div>
  );
}
