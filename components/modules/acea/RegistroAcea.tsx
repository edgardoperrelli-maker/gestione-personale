'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import Button from '@/components/Button';
import { toast } from '@/components/ui/Toast';
import {
  COLONNE_DUNNING, COLONNE_MASSIVE, dataIt, type DefColonna, type RigaTabella,
} from '@/lib/acea/colonneTabella';
import { MAX_RIGHE_EXPORT, nomeFileExport } from '@/lib/acea/exportVista';
import { contaFiltriColonna } from '@/lib/acea/filtriOrdini';
import { COLONNE_EDITABILI, useEditingGriglia, type Operatore } from './useEditingGriglia';
import TabellaOrdini, { chiaveRiga } from './TabellaOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';
import BarraAzioni from './BarraAzioni';
import MenuColonne from './MenuColonne';
import { caricaTutteLeRighe, esportaVista } from './esportaVista';
import { useOrdiniAcea } from './useOrdiniAcea';

const numero = (n: number) => n.toLocaleString('it-IT');

/** Registro ordini con filtri, tabella virtualizzata e selezione. Condiviso da Dunning e Massive. */
export default function RegistroAcea({ famiglia }: { famiglia: 'dunning' | 'massive' }) {
  const colonne: DefColonna[] = famiglia === 'dunning' ? COLONNE_DUNNING : COLONNE_MASSIVE;
  const [visibili, setVisibili] = useState<Set<string>>(
    () => new Set(colonne.filter((c) => c.predefinita).map((c) => c.chiave)),
  );
  const [selezione, setSelezione] = useState<RowSelectionState>({});
  const [esportando, setEsportando] = useState(false);
  const [scaricate, setScaricate] = useState(0);

  const {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni, altre, tutteCaricate,
    ricarica, perPagina, query,
  } = useOrdiniAcea(famiglia);

  const colonneVisibili = useMemo(
    () => colonne.filter((c) => visibili.has(c.chiave)),
    [colonne, visibili],
  );

  const selezionate: RigaTabella[] = useMemo(
    () => righe.filter((r) => selezione[chiaveRiga(r)]),
    [righe, selezione],
  );

  // Operatori: servono sia alla barra azioni sia alla validazione dei nomi incollati in griglia.
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/personale');
        if (!res.ok) return;
        const body = (await res.json()) as { rows?: Operatore[] } | Operatore[];
        const rows = Array.isArray(body) ? body : (body.rows ?? []);
        setOperatori(rows.filter((r) => r.id && r.display_name));
      } catch {
        /* senza elenco l'editing sui nomi non valida, ma la tabella resta usabile */
      }
    })();
  }, []);

  // `onSalvato: ricarica` e non `() => ricarica()`: una lambda nuova a ogni render fa riregistrare
  // i tre listener globali di `useEditingGriglia` a ogni battuta.
  const editing = useEditingGriglia({ righe, operatori, onSalvato: ricarica, attivo: true });

  const indiceEditabile = useCallback((chiave: string) => {
    const i = COLONNE_EDITABILI.indexOf(chiave as (typeof COLONNE_EDITABILI)[number]);
    return i >= 0 ? i : null;
  }, []);

  /** Valore non ancora confermato dal server, mostrato in corsivo finché non si ricarica. */
  const valoreLocale = useCallback((r: RigaTabella, chiave: string): string | null => {
    const loc = editing.locali.get(`${r.odl}|${r.numero_operazione}`);
    if (!loc) return null;
    if (chiave === 'pianificato_a') return loc.pianificato_a ?? null;
    if (chiave === 'pianificato_il') return loc.pianificato_il ? dataIt(loc.pianificato_il) : null;
    return null;
  }, [editing.locali]);

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
    <div className="space-y-2">
      <BarraFiltriAcea
        filtri={filtri}
        onChange={setFiltri}
        colonne={colonne}
        totale={totale}
        caricate={righe.length}
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
            operatori={operatori}
          />
          {selezionate.length === 0 && (
            <span className="text-xs text-[var(--brand-text-muted)]">
              Seleziona le righe da pianificare (shift-click per un intervallo)
            </span>
          )}
        </div>
        <MenuColonne
          colonne={colonne}
          visibili={visibili}
          onChange={setVisibili}
          onEsporta={() => void esporta()}
          esportando={esportando}
          vuota={totale === 0}
          nota={
            esportando && !tutteCaricate
              ? `${numero(scaricate)} di ${numero(totale)} righe`
              : undefined
          }
        />
      </div>

      <TabellaOrdini
        righe={righe}
        colonne={colonne}
        colonneVisibili={visibili}
        oggi={oggi}
        selezione={selezione}
        onSelezione={setSelezione}
        caricando={caricando}
        filtri={filtri}
        onFiltri={setFiltri}
        opzioni={opzioni}
        editing={{
          indiceEditabile,
          focus: editing.focus,
          celleSelezionate: editing.celleSelezionate,
          valoreLocale,
          onClickCella: editing.clickCella,
        }}
      />

      <p className="text-xs text-[var(--brand-text-muted)]">
        Esecutore e Data pianificata si modificano direttamente in tabella: clicca una cella, usa le
        frecce per spostarti, <kbd>Shift</kbd>+frecce o shift-click per un intervallo,{' '}
        <kbd>Ctrl</kbd>+<kbd>C</kbd> e <kbd>Ctrl</kbd>+<kbd>V</kbd> per copiare e incollare anche
        da Excel. I campi ACEA non sono modificabili.
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
