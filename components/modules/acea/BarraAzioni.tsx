'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ClipboardCopy, ClipboardList, Undo2, X } from 'lucide-react';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { ATTIVITA_TABELLONE, type Famiglia } from '@/lib/acea/famiglia';
import type { GiornoProgrammabile } from '@/lib/acea/giorniProgrammabili';
import type { PianoCarico } from '@/lib/acea/caricaSuRapportino';
import { giornoEsteso } from '@/lib/acea/giorniProgrammabili';
import type { EsitoOperatore, TipoEsito } from '@/lib/acea/vociRapportino';

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
  /** I due giorni su cui si può programmare: oggi e il prossimo giorno lavorativo. */
  giorni: GiornoProgrammabile[];
  /** Giorno scelto, condiviso con la griglia: è per quel giorno che si stanno leggendo i nomi. */
  giorno: string;
  onGiorno: (data: string) => void;
  /** Copia negli appunti le righe spuntate. Torna `false` se non c'era niente da copiare. */
  onCopiaRighe: () => Promise<boolean>;
  /**
   * Il piano di carico sul rapportino: le righe spuntate raggruppate per (esecutore, giorno).
   *
   * Lo calcola il registro (`gruppiPerRapportino`) perché servono le righe intere e l'anagrafica
   * attivi; qui arriva già deciso — la barra deve solo dirlo e premere.
   */
  pianoCarico: PianoCarico;
  /** Dopo un carico riuscito: ricarica la tabella (gli stati intervento possono muoversi). */
  onCaricato: () => void;
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
  famiglia, chiavi, onAnnullaSelezione, onPianificato, operatori, giorni, giorno, onGiorno,
  onCopiaRighe, pianoCarico, onCaricato,
}: Props) {
  const { etichetta: etichettaAttivita } = ATTIVITA_TABELLONE[famiglia];
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; descrizione: string } | null>(null);

  /**
   * Carica le righe spuntate sul rapportino del loro esecutore, per il loro giorno.
   *
   * È la scorciatoia del gesto «queste righe vanno SUBITO sul rapportino di oggi di X», che
   * prima passava dagli Strumenti. Il motore è lo stesso (`/api/acea/rapportini` con `staffIds`):
   * un rapportino per operatore per giorno, additivo, idempotente — quindi il rapportino di X
   * riceve TUTTI i suoi interventi ACEA di quel giorno, e ripremere non duplica niente.
   */
  const caricaSuRapportino = useCallback(async () => {
    const { gruppi, nonPronte } = pianoCarico;
    if (gruppi.length === 0) {
      toast.error('Nessuna riga selezionata è pianificata: servono esecutore e data.');
      return;
    }
    if (nonPronte > 0) {
      toast.error(
        `${nonPronte} ${nonPronte === 1 ? 'riga selezionata non è pianificata' : 'righe selezionate non sono pianificate'}: completa esecutore e data, o deselezionale.`,
      );
      return;
    }
    const elenco = gruppi
      .map((g) => `${g.righe} ${g.righe === 1 ? 'intervento' : 'interventi'} → ${g.nome}, ${giornoEsteso(g.data)}`)
      .join(' · ');
    const ok = await chiediConferma({
      title: gruppi.length === 1
        ? `Caricare sul rapportino di ${gruppi[0].nome}?`
        : `Caricare su ${gruppi.length} rapportini?`,
      message:
        `${elenco}. Ogni rapportino riceve tutti gli interventi ACEA pianificati per quell'operatore `
        + 'in quel giorno; ricaricare non duplica niente.',
      confirmLabel: 'Carica',
    });
    if (!ok) return;

    setBusy(true);
    try {
      for (const g of gruppi) {
        const chiama = (extra: Record<string, boolean>) => fetch('/api/acea/rapportini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: g.data, staffIds: [g.staffId], ...extra }),
        });
        let res = await chiama({});
        let body = (await res.json()) as {
          esiti?: EsitoOperatore[]; error?: string; incomplete?: string[];
        };
        // Righe a metà su quel giorno: il cancello del motore. Si chiede, come negli Strumenti.
        if (res.status === 409 && body.incomplete) {
          const n = body.incomplete.length;
          const procedi = await chiediConferma({
            title: `${n} ${n === 1 ? 'ordine è programmato' : 'ordini sono programmati'} per ${giornoEsteso(g.data)} senza esecutore`,
            message: 'Non entreranno in nessun rapportino finché non hanno anche l\'esecutore. Caricare lo stesso senza di loro?',
            confirmLabel: 'Carica senza di loro',
          });
          if (!procedi) continue;
          res = await chiama({ confermaIncomplete: true });
          body = (await res.json()) as typeof body;
        }
        if (!res.ok) {
          toast.error(body.error ?? `Carico non riuscito per ${g.nome}.`);
          continue;
        }
        const esito = (body.esiti ?? []).find((e) => e.staff_id === g.staffId);
        if (esito?.esito === 'richiede_riapertura') {
          const riapri = await chiediConferma({
            title: `${g.nome} ha già consegnato il rapportino di ${giornoEsteso(g.data)}`,
            message: 'Riaprirlo per 48 ore e aggiungere gli interventi? Quanto già compilato resta com\'è.',
            confirmLabel: 'Riapri e aggiungi',
          });
          if (riapri) {
            res = await chiama({ confermaIncomplete: true, confermaRiaperture: true });
            body = (await res.json()) as typeof body;
            if (!res.ok) {
              toast.error(body.error ?? `Riapertura non riuscita per ${g.nome}.`);
              continue;
            }
          } else {
            continue;
          }
        }
        const finale = (body.esiti ?? []).find((e) => e.staff_id === g.staffId);
        const ETICHETTA: Record<TipoEsito, string> = {
          creato: 'rapportino creato',
          aggiunto: 'aggiunto al rapportino',
          richiede_riapertura: 'già consegnato',
          nessuna_modifica: 'era già tutto a bordo',
        };
        toast.success(
          finale
            ? `${g.nome}, ${giornoEsteso(g.data)}: ${ETICHETTA[finale.esito]}${finale.voci_aggiunte > 0 ? ` (+${finale.voci_aggiunte} voci)` : ''}`
            : `${g.nome}, ${giornoEsteso(g.data)}: nessun intervento da caricare`,
        );
      }
      onCaricato();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Carico sul rapportino non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [pianoCarico, onCaricato]);

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
        body: JSON.stringify({ chiavi, data: giorno, staffId }),
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
  }, [chiavi, giorno, staffId, operatori, onAnnullaSelezione, onPianificato]);

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

  const giornoScelto = giorni.find((g) => g.data === giorno);

  return (
    /*
      ALTEZZA FISSA h-9, la stessa della riga dei comandi in cui vive (a destra del «?»).

      Prima era un riquadro con la sua aria attorno (py-2, riga a parte): comparendo alla prima
      spunta faceva crescere la riga e la tabella slittava in giù — il click successivo cadeva
      su una riga diversa da quella mirata. Ora comparire e sparire non muove NIENTE: dentro i
      36px stanno select h-8 e bottoni sm, e il riquadro resta un riquadro (fondo primario) ma
      della taglia dei comandi che ha accanto.
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

            Un menu di due voci e non più un campo data: si programma solo per oggi e per il
            prossimo giorno lavorativo, e un campo libero accettava qualunque giorno per poi
            farlo rifiutare dal server.
          */}
          <Select
            value={giorno}
            onChange={(e) => onGiorno(e.target.value)}
            aria-label="Giorno di lavoro"
            className="h-8 w-40"
          >
            {giorni.map((g) => (
              <option key={g.data} value={g.data}>{`${g.etichetta} · ${g.esteso}`}</option>
            ))}
          </Select>

          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            aria-label="Assegna a"
            className="h-8 w-48"
            disabled={operatori.length === 0}
          >
            <option value="">
              {operatori.length === 0 ? `Nessuno su ${etichettaAttivita} in tabellone` : 'Assegna a…'}
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

          <Button variant="primary" size="sm" onClick={() => void pianifica()} disabled={!staffId} loading={busy}>
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
            Le righe spuntate, dritte sul rapportino del loro esecutore: senza passare dagli
            Strumenti. Compare solo quando fra le spunte c'è almeno una riga pianificata — su
            righe nude non c'è nessun rapportino su cui caricare.
          */}
          {pianoCarico.gruppi.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void caricaSuRapportino()} loading={busy}>
              <ClipboardList size={14} aria-hidden="true" />
              Sul rapportino
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={onAnnullaSelezione}>
            <X size={14} aria-hidden="true" />
            Deseleziona
          </Button>

          {operatori.length === 0 && giornoScelto && (
            // `nowrap`: dentro una barra ad altezza fissa un testo che va a capo sfonda i 36px.
            // Meglio una barra larga (la riga dei comandi sa andare a capo) che una sformata.
            <span className="whitespace-nowrap text-xs text-[var(--brand-text-muted)]">
              Nessuno con {etichettaAttivita} in tabellone per {giornoScelto.esteso}:{' '}
              <a href="/dashboard" className="underline">compilalo</a>.
            </span>
          )}

          {/*
            Detto PRIMA di premere, non dopo. Senza, il venerdì si selezionavano quaranta righe, si
            premeva Pianifica e ne passavano tre: l'esito diceva «37 saltati» e sembrava un guasto.
            `--status-warn` perché qui il colore è l'informazione (DESIGN.md §«Semantici e stato»).

            Solo nel DUNNING: la regola «solo attivazioni» è sua. Le limitazioni massive sono
            esenti (dec. 38) — venerdì e sabato lì si pianifica normalmente, e un avviso su una
            regola che non morde sarebbe un falso allarme che insegna a ignorare quello vero.
          */}
          {giornoScelto?.soloAttivazioni && famiglia !== 'massive' && operatori.length > 0 && (
            <span className="whitespace-nowrap text-xs text-[var(--status-warn)]">
              {giornoScelto.esteso}: passano solo le attivazioni, le altre righe vengono saltate.
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
