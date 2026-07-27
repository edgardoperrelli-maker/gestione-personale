'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Undo2, X } from 'lucide-react';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';

type Operatore = { id: string; display_name: string };

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
};

const oggiIso = () => new Date().toLocaleDateString('sv-SE');

/**
 * Barra delle azioni in blocco: assegna operatore e giorno alle righe selezionate.
 *
 * L'annullamento resta disponibile finché non si fa un'altra operazione: è la rete per il caso
 * "ho assegnato 200 righe alla persona sbagliata", che senza undo si ripara solo riga per riga.
 */
export default function BarraAzioni({ chiavi, onAnnullaSelezione, onPianificato }: Props) {
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  const [staffId, setStaffId] = useState('');
  const [data, setData] = useState(oggiIso);
  const [busy, setBusy] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; descrizione: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/personale');
        if (!res.ok) return;
        const body = (await res.json()) as { rows?: Operatore[] } | Operatore[];
        const rows = Array.isArray(body) ? body : (body.rows ?? []);
        setOperatori(rows.filter((r) => r.id && r.display_name));
      } catch {
        /* la tendina resta vuota: meglio di un errore bloccante */
      }
    })();
  }, []);

  const pianifica = useCallback(async () => {
    if (!staffId || chiavi.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/acea/pianifica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chiavi, data, staffId }),
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
  }, [chiavi, data, staffId, operatori, onAnnullaSelezione, onPianificato]);

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

          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            aria-label="Assegna a"
            className="h-9 w-52"
          >
            <option value="">Assegna a…</option>
            {operatori.map((o) => (
              <option key={o.id} value={o.id}>{o.display_name}</option>
            ))}
          </Select>

          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-label="Giorno di lavoro"
            className="h-9 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm text-[var(--brand-text-main)]"
          />

          <Button variant="primary" size="sm" onClick={() => void pianifica()} disabled={!staffId} loading={busy}>
            <CalendarCheck size={14} aria-hidden="true" />
            Pianifica
          </Button>

          <Button variant="ghost" size="sm" onClick={onAnnullaSelezione}>
            <X size={14} aria-hidden="true" />
            Deseleziona
          </Button>
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
