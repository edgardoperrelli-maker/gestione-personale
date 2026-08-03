'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Boxes } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import Input from '@/components/Input';
import { toast } from '@/components/ui/Toast';
import { numeriCesta, type ConfigCeste } from '@/lib/acqualatina/ceste';

const ENDPOINT = '/api/acqualatina/ceste';

/**
 * Le ceste di magazzino: da quale numero a quale numero.
 *
 * Serve all'operatore, non all'ufficio. A fine giro, dopo l'invio del rapportino, gli si chiede
 * in quale cesta sta scaricando i contatori: con l'intervallo configurato sceglie il numero da
 * un menu — un tap invece di una digitazione, e un refuso su un numero di cesta è un contatore
 * che l'ufficio poi cerca nel posto sbagliato. Senza, il campo resta libero e funziona lo stesso.
 *
 * Sta in Strumenti perché è una cosa che si tocca quando cambia il magazzino, non mentre si
 * lavora — e cambiarla non deve costare un deploy.
 */
export default function CesteCard() {
  const [config, setConfig] = useState<ConfigCeste | null>(null);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);
  const idMin = useId();
  const idMax = useId();

  const carica = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) return;
      const c = (await res.json()) as ConfigCeste;
      setConfig(c);
      setMin(c.numeroMin === null ? '' : String(c.numeroMin));
      setMax(c.numeroMax === null ? '' : String(c.numeroMax));
    } catch {
      // Best-effort: il campo resta vuoto e si può comunque scrivere.
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  async function salva() {
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Vuoti = si TOGLIE l'intervallo e il campo dell'operatore torna libero: è la via
        // d'uscita quando il magazzino si riorganizza e i numeri non si sanno ancora.
        body: JSON.stringify({ numeroMin: min.trim() || null, numeroMax: max.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Intervallo non salvato.');
        return;
      }
      await carica();
      toast.success(
        min.trim() && max.trim()
          ? `Ceste da ${min.trim()} a ${max.trim()}.`
          : 'Intervallo tolto: l\'operatore scriverà il numero a mano.',
      );
    } catch {
      toast.error('Salvataggio non riuscito (rete).');
    } finally {
      setBusy(false);
    }
  }

  const anteprima = config ? numeriCesta(config) : [];
  const invariato =
    config !== null &&
    (config.numeroMin === null ? '' : String(config.numeroMin)) === min.trim() &&
    (config.numeroMax === null ? '' : String(config.numeroMax)) === max.trim();

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-[var(--brand-text-muted)]" aria-hidden />
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Ceste di magazzino</h2>
      </div>
      <p className="mb-3 text-sm text-[var(--brand-text-muted)]">
        I numeri delle ceste in cui gli operatori scaricano i misuratori rimossi. A fine giro
        l&apos;app chiede in quale cesta li stanno mettendo: con l&apos;intervallo qui sotto lo
        scelgono da un elenco, senza lo scrivono a mano.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]" id={`${idMin}-l`}>Dalla cesta</span>
          <Input
            id={idMin}
            aria-labelledby={`${idMin}-l`}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            inputMode="numeric"
            disabled={busy}
            placeholder="1"
          />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs text-[var(--brand-text-muted)]" id={`${idMax}-l`}>Alla cesta</span>
          <Input
            id={idMax}
            aria-labelledby={`${idMax}-l`}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            inputMode="numeric"
            disabled={busy}
            placeholder="20"
          />
        </label>
        <Button variant="primary" size="sm" onClick={salva} loading={busy} disabled={invariato}>
          Salva
        </Button>
      </div>
      <p className="mt-3 text-xs text-[var(--brand-text-muted)]">
        {anteprima.length > 0
          ? `L'operatore sceglie fra ${anteprima.length} ${anteprima.length === 1 ? 'cesta' : 'ceste'}: ${anteprima.slice(0, 8).join(', ')}${anteprima.length > 8 ? '…' : ''}`
          : 'Nessun intervallo: l\'operatore scrive il numero di cesta a mano.'}
      </p>
    </Card>
  );
}
