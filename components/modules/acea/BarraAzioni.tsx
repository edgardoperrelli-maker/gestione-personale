'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, ClipboardCopy, Undo2, X } from 'lucide-react';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import type { GiornoProgrammabile } from '@/lib/acea/giorniProgrammabili';

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
  chiavi, onAnnullaSelezione, onPianificato, operatori, giorni, giorno, onGiorno, onCopiaRighe,
}: Props) {
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; descrizione: string } | null>(null);

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
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-2">
      {chiavi.length > 0 && (
        <>
          <span className="font-mono text-sm font-semibold tabular-nums text-[var(--brand-text-main)]">
            {chiavi.length}
          </span>
          <span className="text-sm text-[var(--brand-text-main)]">
            {chiavi.length === 1 ? 'riga selezionata' : 'righe selezionate'}
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
            className="h-9 w-44"
          >
            {giorni.map((g) => (
              <option key={g.data} value={g.data}>{`${g.etichetta} · ${g.esteso}`}</option>
            ))}
          </Select>

          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            aria-label="Assegna a"
            className="h-9 w-52"
            disabled={operatori.length === 0}
          >
            <option value="">
              {operatori.length === 0 ? 'Nessuno in cronoprogramma' : 'Assegna a…'}
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

          <Button variant="ghost" size="sm" onClick={onAnnullaSelezione}>
            <X size={14} aria-hidden="true" />
            Deseleziona
          </Button>

          {operatori.length === 0 && giornoScelto && (
            <span className="text-xs text-[var(--brand-text-muted)]">
              Nessun operatore in cronoprogramma per {giornoScelto.esteso}:{' '}
              <a href="/dashboard" className="underline">compila il tabellone</a>.
            </span>
          )}

          {/*
            Detto PRIMA di premere, non dopo. Senza, il venerdì si selezionavano quaranta righe, si
            premeva Pianifica e ne passavano tre: l'esito diceva «37 saltati» e sembrava un guasto.
            `--status-warn` perché qui il colore è l'informazione (DESIGN.md §«Semantici e stato»).
          */}
          {giornoScelto?.soloAttivazioni && operatori.length > 0 && (
            <span className="text-xs text-[var(--status-warn)]">
              {giornoScelto.esteso}: passano solo le attivazioni (riaperture). Le altre righe
              vengono saltate.
            </span>
          )}
        </>
      )}

      {ultima && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void annulla()}
          loading={busy}
          className="ml-auto"
        >
          <Undo2 size={14} aria-hidden="true" />
          Annulla ultima ({ultima.descrizione})
        </Button>
      )}
    </div>
  );
}
