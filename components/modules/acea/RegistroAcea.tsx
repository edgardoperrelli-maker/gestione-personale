'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { ClipboardList, Maximize2, Minimize2, RefreshCw, Upload } from 'lucide-react';
import Button from '@/components/Button';
import { toast } from '@/components/ui/Toast';
import {
  COLONNE_DUNNING, COLONNE_MASSIVE, colonnePerStato, dataIt,
  type DefColonna, type RigaTabella,
} from '@/lib/acea/colonneTabella';
import { MAX_RIGHE_EXPORT, nomeFileExport } from '@/lib/acea/exportVista';
import { contaFiltriColonna } from '@/lib/acea/filtriOrdini';
import type { GiornoProgrammabile } from '@/lib/acea/giorniProgrammabili';
import { useEditingGriglia, type Operatore } from './useEditingGriglia';
import { useLayoutTabella } from './useLayoutTabella';
import TabellaOrdini, { chiaveRiga } from './TabellaOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';
import BarraAzioni from './BarraAzioni';
import MenuColonne from './MenuColonne';
import { caricaTutteLeRighe, esportaVista } from './esportaVista';
import { useOrdiniAcea } from './useOrdiniAcea';

const numero = (n: number) => n.toLocaleString('it-IT');

/** Registro ordini con filtri, tabella virtualizzata e selezione. Condiviso da Dunning e Massive. */
export default function RegistroAcea({ famiglia }: { famiglia: 'dunning' | 'massive' }) {
  const definizione: DefColonna[] = famiglia === 'dunning' ? COLONNE_DUNNING : COLONNE_MASSIVE;
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

  const {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni, altre, tutteCaricate,
    ricarica, perPagina, query, riapertureDaAssegnare,
  } = useOrdiniAcea(famiglia);

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
    tabellone per oggi e per il prossimo giorno lavorativo. Chi programma ACEA la mattina deve
    vedere le persone che quel giorno ci sono davvero — l'elenco completo degli attivi conteneva
    anche chi è in ferie e chi sta su un'altra commessa, e non c'era modo di distinguerli se non
    chiedendo. «Oggi» lo decide il server, in fuso Europe/Rome: con l'orologio del browser un PC
    con la data sbagliata proporrebbe due giorni che il server poi rifiuta.
  */
  const [giorni, setGiorni] = useState<GiornoProgrammabile[]>([]);
  const [operatoriPerGiorno, setOperatoriPerGiorno] = useState<Record<string, Operatore[]>>({});
  const [giorno, setGiorno] = useState('');
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
        const res = await fetch('/api/acea/operatori');
        if (!res.ok || !vivo) return;
        const body = (await res.json()) as {
          giorni: Array<GiornoProgrammabile & { operatori: Operatore[] }>;
        };
        const elenco = body.giorni ?? [];
        // Gli operatori escono dal giorno e vanno nella mappa: `giorni` descrive la finestra e
        // basta, così passarlo alla griglia non si porta dietro due elenchi di nomi.
        setGiorni(elenco.map((g) => ({
          data: g.data, etichetta: g.etichetta, esteso: g.esteso, soloAttivazioni: g.soloAttivazioni,
        })));
        setOperatoriPerGiorno(Object.fromEntries(elenco.map((g) => [g.data, g.operatori])));
        // Il giorno scelto si imposta una volta sola: se l'utente ha già scelto «domani» e nel
        // frattempo qualcosa ricarica la finestra, riportarlo a oggi gli cambierebbe il bersaglio
        // sotto le mani.
        setGiorno((g) => (g && elenco.some((x) => x.data === g) ? g : (elenco[0]?.data ?? '')));
      } catch {
        /* senza finestra l'assegnazione resta ferma, ma la tabella si legge e si copia lo stesso */
      }
    })();
    return () => { vivo = false; };
  }, []);

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
    giorni,
    righeSpuntate,
    colonneVisibili: chiaviVisibili,
    onSalvato: ricarica,
    attivo: true,
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
    return () => { document.body.style.overflow = precedente; };
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
          oggi,
          filtrato: contaFiltriColonna(filtri) > 0 || filtri.cerca.trim() !== '',
        }),
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
            {famiglia === 'dunning' ? 'Dunning' : 'Limitazioni massive'} — registro ordini
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
        // badge e` una seconda rete: se un domani la scheda tornasse, il numero — che conta
        // ordini di dunning — non comparirebbe comunque sulla vista sbagliata.
        famiglia={famiglia}
        riapertureDaAssegnare={famiglia === 'dunning' ? riapertureDaAssegnare : null}
      />

      {/*
        La barra azioni occupa SEMPRE la sua riga, anche senza selezione (allora ospita il
        suggerimento). Prima entrava nel flusso solo a selezione fatta, spingendo la tabella verso
        il basso di ~44px: il click successivo cadeva su una riga diversa da quella mirata.
      */}
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Sempre montata: tiene in vita l'annullamento dell'ultima pianificazione, che vive nel
            suo stato interno e sparirebbe smontandola alla deselezione — proprio quando serve.
            Si nasconde da sola quando non ha niente da dire.
          */}
          <BarraAzioni
            chiavi={selezionate.map(chiaveRiga)}
            onAnnullaSelezione={() => setSelezione({})}
            onPianificato={ricarica}
            operatori={operatoriDelGiorno}
            giorni={giorni}
            giorno={giorno}
            onGiorno={setGiorno}
            onCopiaRighe={editing.copiaRigheSpuntate}
          />
          {selezionate.length === 0 && (
            <span className="text-xs text-[var(--brand-text-muted)]">
              Seleziona le righe da pianificare o da copiare (shift-click per un intervallo)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/*
            Scorciatoie, non doppioni: i due motori vivono negli Strumenti della commessa e restano
            li`. Da qui ci si arriva in un click perche` sono le due cose che si fanno GUARDANDO il
            registro — si importa l'export nuovo e si generano i rapportini del giorno — e passare
            dal menu ogni volta e` un giro che non serve.

            `<a>` e non un pulsante con `router.push`: e` una navigazione, quindi deve poter essere
            aperta in una scheda nuova col click centrale o col Ctrl, che e` esattamente cio` che
            si vuole quando si sta lavorando su una tabella e non la si vuole perdere.
          */}
          <a
            href="/hub/acea/strumenti#import"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-1.5 text-xs text-[var(--brand-text-main)] transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <Upload size={14} aria-hidden="true" />
            Importa export
          </a>
          <a
            href="/hub/acea/strumenti#rapportini"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-1.5 text-xs text-[var(--brand-text-main)] transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            <ClipboardList size={14} aria-hidden="true" />
            Rapportini
          </a>

          {/*
            Il comando sta DENTRO il riquadro ingrandito, non nella pagina sotto: cliccandolo il
            focus gli resta addosso in entrambi gli stati, quindi non serve spostarlo a mano né
            riportarlo indietro all'uscita.

            Niente `aria-pressed`: l'etichetta cambia e dice già cosa farà il prossimo click, e
            sommare le due cose fa annunciare «Riduci, premuto», che si contraddice.
          */}
          <Button variant="outline" size="sm" onClick={() => setIngrandita((v) => !v)}>
            {ingrandita
              ? <Minimize2 size={14} aria-hidden="true" />
              : <Maximize2 size={14} aria-hidden="true" />}
            {ingrandita ? 'Riduci' : 'Ingrandisci'}
          </Button>

          <MenuColonne
            colonne={colonneVista}
            visibili={visibili}
            onChange={setVisibili}
            onEsporta={() => void esporta()}
            esportando={esportando}
            vuota={totale === 0}
            onAzzeraLayout={personalizzato ? azzera : undefined}
            nota={
              esportando && !tutteCaricate
                ? `${numero(scaricate)} di ${numero(totale)} righe`
                : undefined
            }
          />
        </div>
      </div>

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
        }}
      />

      <p className="text-xs text-[var(--brand-text-muted)]">
        Esecutore, Data pianificata e Note si modificano direttamente in tabella: clicca una cella, usa le
        frecce per spostarti, <kbd>Shift</kbd>+frecce o shift-click per un intervallo,{' '}
        <kbd>Ctrl</kbd>+<kbd>C</kbd> e <kbd>Ctrl</kbd>+<kbd>V</kbd> per copiare e incollare anche
        da Excel. <strong>Si copia da qualsiasi colonna</strong>, campi ACEA compresi.{' '}
        <strong>Con delle righe spuntate</strong> le scorciatoie lavorano sulle righe intere:{' '}
        <kbd>Ctrl</kbd>+<kbd>C</kbd> le porta via tutte, <kbd>Ctrl</kbd>+<kbd>V</kbd> scrive su
        tutte — un nome incollato su quaranta spunte le assegna in un colpo, senza passare da
        «Pianifica». Si programma solo per{' '}
        {giorni.length > 0 ? giorni.map((g) => g.esteso).join(' o ') : 'oggi o il giorno lavorativo successivo'},
        e i nomi assegnabili sono quelli in <a href="/dashboard" className="underline">cronoprogramma</a>{' '}
        per quel giorno. La nota scritta qui arriva all&apos;operatore dentro il rapportino. Le colonne si
        trascinano per riordinarle e si tirano dal bordo per la larghezza (doppio click sul bordo per
        rimetterla com&apos;era).
        {editing.salvando && <span className="ml-2 italic">salvataggio in corso…</span>}
      </p>

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
