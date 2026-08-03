/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian */
'use client';

import { useMemo, useState } from 'react';
import { PackageCheck, TriangleAlert } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { formatItalian } from '@/utils/date-it';
import {
  numeriCesta,
  validaCesta,
  type ConfigCeste,
  type MisuratoreDaScaricare,
} from '@/lib/acqualatina/ceste';

/**
 * «Stai scaricando i misuratori?» — la domanda di fine giro, solo AcquaLatina.
 *
 * Arriva subito dopo l'invio del rapportino, che è l'unico momento in cui ha senso farla:
 * l'operatore ha ancora i contatori in furgone e sta passando dal magazzino. Chiederlo il
 * giorno dopo dal back office vuol dire chiederlo a chi i contatori non ce li ha più.
 *
 * Due passi e due vie d'uscita vere: «sì» porta alla cesta, «no» chiude e basta — niente da
 * salvare, perché lo stato «da consegnare deposito» dice già «da scaricare» e domani la
 * domanda torna da sé, con dentro anche gli arretrati.
 */
export default function ModaleScaricoMisuratori({
  token,
  oggi,
  arretrati,
  ceste,
  onChiudi,
}: {
  token: string;
  oggi: MisuratoreDaScaricare[];
  arretrati: MisuratoreDaScaricare[];
  ceste: ConfigCeste;
  onChiudi: () => void;
}) {
  const tutti = useMemo(() => [...oggi, ...arretrati], [oggi, arretrati]);
  const [passo, setPasso] = useState<'chiedi' | 'cesta'>('chiedi');
  // Tutte spuntate: il gesto normale è «li scarico tutti» e così costa zero. Chi ne scarica
  // una parte (o ne ha uno rotto in furgone) non è però costretto a mentire.
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(tutti.map((m) => m.id)));
  const [cesta, setCesta] = useState('');
  const [salvando, setSalvando] = useState(false);

  const numeri = useMemo(() => numeriCesta(ceste), [ceste]);
  const controllo = validaCesta(cesta, ceste);

  const toggle = (id: string) =>
    setScelti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });

  async function conferma() {
    if (!controllo.ok || scelti.size === 0 || salvando) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/r/${token}/scarico-misuratori`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...scelti], cesta: cesta.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { scaricati } = (await res.json()) as { scaricati: number };
      toast.success(
        scaricati === 1
          ? `1 misuratore scaricato nella cesta ${cesta.trim()}.`
          : `${scaricati} misuratori scaricati nella cesta ${cesta.trim()}.`,
      );
      onChiudi();
    } catch {
      // Niente chiusura: il lavoro dell'operatore non si perde per una rete che balla, e
      // riprovare è un tocco. Se rinuncia, i contatori restano da scaricare e domani si
      // ripresentano come arretrati.
      toast.error('Scarico non registrato. Controlla la connessione e riprova.');
    } finally {
      setSalvando(false);
    }
  }

  const Elenco = ({ titolo, righe }: { titolo: string; righe: MisuratoreDaScaricare[] }) =>
    righe.length === 0 ? null : (
      <>
        <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          {titolo}
        </p>
        <ul className="space-y-1.5">
          {righe.map((m) => (
            <li key={m.id}>
              {/* Etichetta e non riga cliccabile: il bersaglio della spunta è tutta la voce,
                  che su un telefono in magazzino è l'unica dimensione che si prende. */}
              <label className="flex min-h-[48px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={scelti.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="h-5 w-5 shrink-0 accent-[var(--brand-primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold tabular-nums text-[var(--brand-text-main)]">
                    {m.matricola}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-[var(--brand-text-muted)]">
                    {[m.indirizzo, m.comune].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-[var(--brand-text-subtle)]">
                  <span className="block font-mono tabular-nums">{formatItalian(m.data_esecuzione)}</span>
                  {m.odl && <span className="block font-mono tabular-nums">{m.odl}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </>
    );

  if (passo === 'chiedi') {
    return (
      <Dialog
        open
        onClose={onChiudi}
        variant="sheet"
        title="Stai scaricando i misuratori?"
        className="pb-[env(safe-area-inset-bottom)] sm:pb-0"
        footer={
          <>
            <Button size="touch" variant="outline" className="shrink-0" onClick={onChiudi}>
              No, domani
            </Button>
            <Button
              size="touch"
              variant="primary"
              className="flex-1"
              disabled={scelti.size === 0}
              onClick={() => setPasso('cesta')}
            >
              Sì, li sto scaricando
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--brand-text-muted)]">
          Hai <b>{tutti.length}</b> {tutti.length === 1 ? 'misuratore' : 'misuratori'} da scaricare in
          magazzino. Togli la spunta a quelli che tieni ancora in furgone.
        </p>
        <Elenco titolo="Di oggi" righe={oggi} />
        <Elenco titolo="Dei giorni scorsi" righe={arretrati} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onChiudi}
      variant="sheet"
      title="In quale cesta li stai mettendo?"
      busy={salvando}
      className="pb-[env(safe-area-inset-bottom)] sm:pb-0"
      footer={
        <>
          <Button size="touch" variant="outline" className="shrink-0" disabled={salvando} onClick={() => setPasso('chiedi')}>
            Indietro
          </Button>
          <Button
            size="touch"
            variant="primary"
            className="flex-1"
            loading={salvando}
            disabled={!controllo.ok}
            onClick={conferma}
          >
            Conferma scarico
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--brand-text-muted)]">
        {scelti.size === 1 ? '1 misuratore' : `${scelti.size} misuratori`} nella stessa cesta.
        {ceste.numeroMin !== null && ceste.numeroMax !== null
          ? ` In magazzino le ceste sono numerate da ${ceste.numeroMin} a ${ceste.numeroMax}.`
          : ''}
      </p>
      <div className="mt-3">
        <label htmlFor="scarico-cesta" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Numero cesta
        </label>
        {/* Col menu si sceglie con un tap e un refuso è impossibile; senza l'intervallo
            configurato resta il campo libero, così il modulo funziona dal primo giorno. */}
        {numeri.length > 0 ? (
          <Select id="scarico-cesta" value={cesta} onChange={(e) => setCesta(e.target.value)} disabled={salvando}>
            <option value="">Scegli…</option>
            {numeri.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        ) : (
          <Input
            id="scarico-cesta"
            value={cesta}
            onChange={(e) => setCesta(e.target.value)}
            disabled={salvando}
            inputMode="numeric"
            autoFocus
            placeholder="es. 3"
          />
        )}
      </div>
      {controllo.fuoriIntervallo && (
        /* Avviso e non blocco: se il magazzino aggiunge una cesta prima che l'ufficio aggiorni
           l'intervallo, la realtà vince — e un blocco costringerebbe a scrivere un numero falso
           pur di chiudere. */
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-[var(--brand-text-main)]">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={1.8} />
          Questa cesta è fuori dall&apos;intervallo che risulta all&apos;ufficio. Se è quella giusta, vai avanti.
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[13px] text-[var(--brand-text-muted)]">
        <PackageCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
        Confermando, i misuratori risultano scaricati a deposito e l&apos;ufficio vede la cesta.
      </p>
    </Dialog>
  );
}
