'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ClipboardCopy, Star, TriangleAlert, Undo2, X } from 'lucide-react';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { ATTIVITA_TABELLONE, type Famiglia } from '@/lib/acea/famiglia';
import {
  eProgrammabile, etichettaGiorno, giornoEsteso, limitiFinestra, soloAttivazioni, spiegaFinestra,
} from '@/lib/acea/giorniProgrammabili';

type Operatore = {
  id: string;
  display_name: string;
  /** Territorio del cronoprogramma, quando c'è. */
  territorio?: string | null;
};

export type EsitoPianifica = {
  operazioneId: string | null;
  creati: number;
  aggiornati: number;
  saltati: Array<{ odl: string; numero_operazione: string; motivo: string }>;
};

type Props = {
  /**
   * La famiglia della vista: decide come si CHIAMA l'attività di tabellone nei messaggi
   * («Nessuno su DUNNING…» / «…su LIMITAZIONI MASSIVE…») e se l'avviso del venerdì/sabato ha
   * senso — la regola «solo attivazioni» è del dunning, le massive ne sono esenti (dec. 38).
   */
  famiglia: Famiglia;
  /** Chiavi `odl|numero_operazione` selezionate. */
  chiavi: string[];
  onAnnullaSelezione: () => void;
  onPianificato: () => void;
  /**
   * Operatori assegnabili nel giorno scelto, forniti dal registro.
   *
   * Non se li carica da sé: `RegistroAcea` chiede già la finestra programmabile per validare i
   * nomi incollati in griglia, e una seconda chiamata identica arrivava a ogni montaggio.
   */
  operatori: Operatore[];
  /** «Oggi» secondo il server (fuso Europe/Rome): da lì si calcolano gli estremi della finestra. */
  oggi: string;
  /** Giorno scelto, condiviso con la griglia: è per quel giorno che si stanno leggendo i nomi. */
  giorno: string;
  onGiorno: (data: string) => void;
  /**
   * `true` mentre si sta chiedendo il tabellone del giorno scelto.
   *
   * Serve a non far comparire «Nessuno in tabellone» nel mezzo di una lettura: sarebbe una
   * risposta, e la risposta non c'è ancora.
   */
  caricandoOperatori?: boolean;
  /** Copia negli appunti le righe spuntate. Torna `false` se non c'era niente da copiare. */
  onCopiaRighe: () => Promise<boolean>;
};

/**
 * Barra delle azioni in blocco: assegna operatore e giorno alle righe selezionate.
 *
 * Non è più l'unica cosa che si può fare con delle righe spuntate: da qui si copiano anche, e in
 * tabella ci si incolla sopra (vedi `useEditingGriglia`). Questa barra resta la via esplicita —
 * scegli, guarda, conferma — mentre l'incolla è la via veloce per chi arriva da Excel.
 *
 * L'annullamento resta disponibile finché non si fa un'altra operazione: è la rete per il caso
 * "ho assegnato 200 righe alla persona sbagliata", che senza undo si ripara solo riga per riga.
 */
export default function BarraAzioni({
  famiglia, chiavi, onAnnullaSelezione, onPianificato, operatori, oggi, giorno, onGiorno,
  caricandoOperatori = false, onCopiaRighe,
}: Props) {
  const { etichetta: etichettaAttivita } = ATTIVITA_TABELLONE[famiglia];
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  /** Marcatura TOP in volo: ha il suo flag e non `busy`, che è della pianificazione. */
  const [marcandoTop, setMarcandoTop] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; descrizione: string } | null>(null);

  /*
    Qui NON c'è più «Sul rapportino»: il carico vive nella modale del comando «Rapportini»
    (`ModaleRapportini`), che è l'unica via — tre funzioni diverse per la stessa cosa erano due
    di troppo, e questa era quella senza anteprima.
  */

  /*
    Cambiando giorno cambia il tabellone, e con esso chi è assegnabile.

    Senza questo, il menu mostrava il nome scelto per oggi anche dopo essere passati a domani, dove
    quella persona non c'è: si premeva Pianifica e il server rifiutava. Il nome resta solo se è
    ancora in elenco.
  */
  useEffect(() => {
    if (staffId && !operatori.some((o) => o.id === staffId)) setStaffId('');
  }, [operatori, staffId]);

  const pianifica = useCallback(async () => {
    if (!staffId || chiavi.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/acea/pianifica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // La famiglia dice al server QUALE registro leggere (acea_ordini / acqualatina_ordini).
        body: JSON.stringify({ chiavi, data: giorno, staffId, famiglia }),
      });
      const body = (await res.json()) as EsitoPianifica & { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'Pianificazione non riuscita.');
        return;
      }
      const nome = operatori.find((o) => o.id === staffId)?.display_name ?? 'operatore';
      const parti = [
        body.creati > 0 ? `${body.creati} assegnati` : '',
        body.aggiornati > 0 ? `${body.aggiornati} spostati` : '',
        body.saltati.length > 0 ? `${body.saltati.length} saltati` : '',
      ].filter(Boolean);
      toast.success(`${parti.join(' · ') || 'Nessuna modifica'} — ${nome}`);

      // I saltati non spariscono in silenzio: si dice quali e perché.
      if (body.saltati.length > 0) {
        const primi = body.saltati.slice(0, 3).map((s) => `${s.odl} (${s.motivo})`).join('; ');
        toast.info(
          body.saltati.length > 3
            ? `Saltati: ${primi} e altri ${body.saltati.length - 3}`
            : `Saltati: ${primi}`,
        );
      }
      if (body.operazioneId) {
        setUltima({ id: body.operazioneId, descrizione: `${body.creati + body.aggiornati} righe → ${nome}` });
      }
      onAnnullaSelezione();
      onPianificato();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pianificazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }, [chiavi, giorno, staffId, famiglia, operatori, onAnnullaSelezione, onPianificato]);

  /**
   * Segna (o toglie) il TOP sulle righe spuntate.
   *
   * Non tocca la pianificazione: il TOP è una proprietà dell'ORDINE — come lo vuole ACEA — non
   * dell'uscita che ci mandiamo noi, e infatti si marca anche una riga mai pianificata.
   * Ricarica invece di correggere la riga a mano: la tabella è virtualizzata e la sua verità è
   * la fetch, non lo stato del client.
   */
  const segnaTop = useCallback(async (top: boolean) => {
    if (marcandoTop || chiavi.length === 0) return;
    setMarcandoTop(true);
    try {
      const res = await fetch('/api/acea/ordini/top', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // La famiglia dice al server QUALE registro scrivere, come per la pianificazione.
        body: JSON.stringify({ chiavi, top, famiglia }),
      });
      const json = await res.json().catch(() => ({})) as { aggiornati?: number; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Marcatura TOP non riuscita.');
        return;
      }
      const n = json.aggiornati ?? chiavi.length;
      toast.success(top
        ? `${n} ${n === 1 ? 'ordine segnato' : 'ordini segnati'} TOP.`
        : `TOP tolto da ${n} ${n === 1 ? 'ordine' : 'ordini'}.`);
      onPianificato();
    } catch {
      toast.error('Marcatura TOP non riuscita (rete).');
    } finally {
      setMarcandoTop(false);
    }
  }, [chiavi, famiglia, marcandoTop, onPianificato]);

  const annulla = useCallback(async () => {
    if (!ultima) return;
    setBusy(true);
    try {
      const res = await fetch('/api/acea/pianifica/annulla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operazioneId: ultima.id }),
      });
      const body = (await res.json()) as
        { eliminati: number; ripristinati: number; protetti: string[]; error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'Annullamento non riuscito.');
        return;
      }
      toast.success(`Annullata: ${body.eliminati} rimossi, ${body.ripristinati} ripristinati`);
      if (body.protetti.length > 0) {
        toast.info(
          `${body.protetti.length} interventi nel frattempo completati non sono stati toccati`,
        );
      }
      setUltima(null);
      onPianificato();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Annullamento non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [ultima, onPianificato]);

  if (chiavi.length === 0 && !ultima) return null;

  const limiti = limitiFinestra(oggi);
  /*
    Una data che il campo non avrebbe dovuto accettare: `min`/`max` fermano il calendario ma non
    la digitazione, e la domenica dentro i due estremi il calendario la offre comunque.

    Non si torna indietro di nascosto — la data resta quella scritta — ma lo si DICE e si spegne
    «Pianifica»: rimettere il giorno di prima senza spiegare farebbe sembrare il campo rotto.
  */
  const fuoriFinestra = Boolean(oggi) && giorno !== '' && !eProgrammabile(giorno, oggi);

  return (
    /*
      ALTEZZA FISSA h-9, la stessa della riga dei comandi in cui vive (a destra del «?»).

      Prima era un riquadro con la sua aria attorno (py-2, riga a parte): comparendo alla prima
      spunta faceva crescere la riga e la tabella slittava in giù — il click successivo cadeva
      su una riga diversa da quella mirata. Ora comparire e sparire non muove NIENTE: dentro i
      36px stanno campi e bottoni TUTTI a 30px (la scatola dei Button sm), e il riquadro resta
      un riquadro (fondo primario) ma della taglia dei comandi che ha accanto.
    */
    <div className="flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-2">
      {chiavi.length > 0 && (
        <>
          <span className="whitespace-nowrap text-sm text-[var(--brand-text-main)]">
            <span className="font-mono font-semibold tabular-nums">{chiavi.length}</span>
            {chiavi.length === 1 ? ' riga' : ' righe'}
          </span>

          {/*
            Il giorno prima dell'operatore, e non dopo: è il giorno a decidere quali nomi si
            vedono. Invertirli faceva scegliere una persona e poi vedersela sparire cambiando
            data — l'ordine di lettura deve seguire quello di dipendenza.

            UN CAMPO DATA, non più il menu di due voci: la finestra ora arriva a due settimane
            (dec. 49) e il lunedì — il primo giorno pieno del dunning, visto che venerdì e sabato
            passano solo le attivazioni — con due voci non era raggiungibile affatto. Si scrive o
            si sceglie dal calendario; `min`/`max` sono gli estremi veri della finestra.

            L'etichetta accanto («oggi», «domani», «lunedì») resta perché il campo mostra il
            numero e non il giorno della settimana, ed è il giorno della settimana a decidere se
            passano solo le attivazioni.
          */}
          <input
            type="date"
            value={giorno}
            onChange={(e) => onGiorno(e.target.value)}
            min={limiti?.min}
            max={limiti?.max}
            aria-label="Giorno di lavoro"
            aria-invalid={fuoriFinestra || undefined}
            title={oggi ? `${spiegaFinestra(oggi)}.` : undefined}
            /*
              `h-[30px]` come i Button sm che gli stanno in fila (py-1.5 + testo 12 + bordo = 30):
              a h-8 campo e menu sporgevano di 2px sui bottoni della stessa barra — la classe
              esatta di disallineamento bonificata su tutta la console in questa PR.
            */
            className={`h-[30px] w-[8.75rem] shrink-0 rounded-[var(--radius-md)] border bg-[var(--brand-surface)] px-2 text-sm text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
              fuoriFinestra ? 'border-[var(--status-ko)]' : 'border-[var(--brand-border)]'
            }`}
          />
          {giorno !== '' && !fuoriFinestra && (
            <span className="whitespace-nowrap text-xs text-[var(--brand-text-muted)]">
              {etichettaGiorno(giorno, oggi).toLowerCase()}
            </span>
          )}
          {fuoriFinestra && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--status-ko)]"
              title={`${giornoEsteso(giorno)}: ${spiegaFinestra(oggi)}.`}
            >
              <TriangleAlert size={12} aria-hidden="true" />
              fuori finestra
              <span className="sr-only">: {spiegaFinestra(oggi)}.</span>
            </span>
          )}

          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            aria-label="Assegna a"
            className="h-[30px] w-48 py-0 text-xs"
            disabled={operatori.length === 0}
            // Il nome dell'attività per esteso sta qui: dentro una select da w-48
            // «LIMITAZIONI MASSIVE» usciva tagliato a metà parola.
            title={operatori.length === 0 && !caricandoOperatori
              ? `Nessun operatore con attività ${etichettaAttivita} in cronoprogramma`
              : undefined}
          >
            {/*
              «Nessuno in tabellone» è una RISPOSTA, e finché il tabellone del giorno si sta
              leggendo la risposta non c'è: scegliendo un giorno nuovo dal campo data comparirebbe
              per un istante, e chi legge veloce va a compilare un cronoprogramma che è pieno.
            */}
            <option value="">
              {caricandoOperatori
                ? 'Carico il tabellone…'
                : operatori.length === 0 ? 'Nessuno in tabellone' : 'Assegna a…'}
            </option>
            {/*
              Il territorio accanto al nome: il primo passo della mattina è «assegnazione in base
              all'operatore più vicino», e con il solo cognome quella scelta si fa a memoria.
            */}
            {operatori.map((o) => (
              <option key={o.id} value={o.id}>
                {o.territorio ? `${o.display_name} · ${o.territorio}` : o.display_name}
              </option>
            ))}
          </Select>

          <Button
            variant="primary"
            size="sm"
            onClick={() => void pianifica()}
            // Fuori finestra non parte: il server rifiuterebbe comunque, e un rifiuto che si può
            // prevedere si dice prima di far premere.
            disabled={!staffId || fuoriFinestra}
            loading={busy}
          >
            <CalendarCheck size={14} aria-hidden="true" />
            Pianifica
          </Button>

          {/*
            Copia le righe spuntate, che è la cosa per cui prima bisognava per forza passare da
            qui: si assegnava soltanto. Il Ctrl+C fa lo stesso, ma da solo non si trova — la barra
            diceva «40 righe selezionate» senza dire che si potevano portare via.
          */}
          <Button variant="outline" size="sm" onClick={() => void onCopiaRighe()}>
            <ClipboardCopy size={14} aria-hidden="true" />
            Copia righe
          </Button>

          {/*
            Il TOP di ACEA. Vive qui e non in una cella cliccabile perché il gesto vero è
            «questi ordini sono prioritari»: arrivano in lista, si cercano e si marcano insieme.
            Il «Togli» sta accanto al «Segna» e non altrove: una marcatura sbagliata deve costare
            quanto è costata farla.
          */}
          <Button variant="outline" size="sm" onClick={() => void segnaTop(true)} loading={marcandoTop}>
            <Star size={14} aria-hidden="true" />
            Segna TOP
          </Button>

          <Button variant="ghost" size="sm" onClick={() => void segnaTop(false)} loading={marcandoTop}>
            Togli TOP
          </Button>

          <Button variant="ghost" size="sm" onClick={onAnnullaSelezione}>
            <X size={14} aria-hidden="true" />
            Deseleziona
          </Button>

          {/*
            COMPATTO, perché la barra vive nella riga dei comandi e non ha spazio da spendere: la
            frase intera («Nessuno con LIMITAZIONI MASSIVE in tabellone per giovedì…») sfondava la
            riga e schiacciava tutti i comandi a sinistra. Il fatto lo dice già la select
            («Nessuno in tabellone», col nome per esteso nel suo title): qui resta solo l'AZIONE.
          */}
          {operatori.length === 0 && !caricandoOperatori && !fuoriFinestra && giorno !== '' && (
            <a
              href="/dashboard"
              className="whitespace-nowrap rounded-[var(--radius-sm)] text-xs text-[var(--brand-text-muted)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              title={`Nessun operatore con attività ${etichettaAttivita} in cronoprogramma per ${giornoEsteso(giorno)}: compila il tabellone.`}
            >
              compila il tabellone
            </a>
          )}

          {/*
            Detto PRIMA di premere, non dopo: senza, il venerdì si selezionavano quaranta righe,
            ne passavano tre e l'esito sembrava un guasto. Badge e non frase per la stessa
            ragione di spazio qui sopra; il tooltip porta la frase intera. `--status-warn` perché
            il colore è l'informazione (DESIGN.md §«Semantici e stato»).

            Solo nel DUNNING: la regola «solo attivazioni» è sua. Le limitazioni massive sono
            esenti (dec. 38) — venerdì e sabato lì si pianifica normalmente, e un avviso su una
            regola che non morde sarebbe un falso allarme che insegna a ignorare quello vero.
          */}
          {soloAttivazioni(giorno) && famiglia !== 'massive' && operatori.length > 0 && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--status-warn)]"
              title={`${giornoEsteso(giorno)}: passano solo le attivazioni (riaperture). Le altre righe vengono saltate.`}
            >
              <TriangleAlert size={12} aria-hidden="true" />
              solo attivazioni
              <span className="sr-only">
                : {giornoEsteso(giorno)} passano solo le attivazioni, le altre righe vengono saltate.
              </span>
            </span>
          )}
        </>
      )}

      {ultima && (
        <Button variant="outline" size="sm" onClick={() => void annulla()} loading={busy}>
          <Undo2 size={14} aria-hidden="true" />
          Annulla ultima ({ultima.descrizione})
        </Button>
      )}
    </div>
  );
}
