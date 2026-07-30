/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import Button from '@/components/Button';
import { inAttesa, novitaAssegnazione, type VoceStato } from '@/lib/rapportini/attesaAssegnazione';

const INTERVALLO_MS = 12_000;

/**
 * L'operatore ha chiesto l'assegnazione di un misuratore ed è FERMO sul posto.
 *
 * Finché la sua voce è sospesa non può lavorare, e il rapportino non si aggiorna da solo:
 * senza questo, scoprirebbe l'assegnazione solo ricaricando la pagina a caso. Qui si chiede
 * al server ogni 12 secondi — ma **solo** mentre c'è qualcosa in attesa, solo con la pagina
 * in primo piano e solo online: appena la coda si svuota, si smette.
 *
 * Quando l'ufficio assegna NON si ricarica sotto le dita: si mostra un pulsante e decide
 * l'operatore. Un reload a sorpresa mentre sta compilando un'altra voce sarebbe un modo
 * ottimo per fargli perdere quello che stava scrivendo.
 */
export function AttesaAssegnazione({ token, voci }: { token: string; voci: VoceStato[] }) {
  const [esito, setEsito] = useState<'attesa' | 'assegnata' | 'rifiutata'>('attesa');
  // Lo stato di partenza è quello che il tablet ha a schermo ORA: il confronto è contro
  // questo, non contro il giro precedente, così una notizia non si annuncia due volte.
  const inizialeRef = useRef<VoceStato[]>(voci);

  const attese = inAttesa(voci);
  const attive = attese.length;

  useEffect(() => {
    if (attive === 0 || esito !== 'attesa') return;
    let vivo = true;

    const chiedi = async () => {
      if (!vivo) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const res = await fetch(`/api/r/${token}/stato-voci`, { cache: 'no-store' });
        if (!res.ok || !vivo) return;
        const j = (await res.json()) as { voci?: VoceStato[] };
        const n = novitaAssegnazione(inizialeRef.current, j.voci ?? []);
        if (!vivo || n.tipo === 'nessuna') return;
        setEsito(n.tipo === 'assegnate' ? 'assegnata' : 'rifiutata');
      } catch {
        /* best-effort: al prossimo giro */
      }
    };

    const id = setInterval(() => void chiedi(), INTERVALLO_MS);
    // Un giro anche al rientro in primo piano: l'operatore che riprende in mano il telefono
    // dopo due minuti non deve aspettarne altri dodici.
    const onVisibile = () => { if (document.visibilityState === 'visible') void chiedi(); };
    document.addEventListener('visibilitychange', onVisibile);
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisibile); };
  }, [token, attive, esito]);

  if (attive === 0 && esito === 'attesa') return null;

  if (esito === 'assegnata') {
    return (
      <div className="mt-3 rounded-[var(--radius-lg)] border-2 border-[var(--success,var(--brand-primary))] bg-[var(--brand-primary-soft)] p-3">
        <p className="flex items-start gap-2 text-sm font-semibold text-[var(--brand-text-main)]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" strokeWidth={2} aria-hidden />
          <span>Misuratore assegnato: puoi eseguire l&apos;intervento.</span>
        </p>
        <Button variant="primary" size="touch" className="mt-3 w-full" onClick={() => window.location.reload()}>
          Apri l&apos;intervento
        </Button>
      </div>
    );
  }

  if (esito === 'rifiutata') {
    return (
      <div className="mt-3 rounded-[var(--radius-lg)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-3">
        <p className="flex items-start gap-2 text-sm font-semibold text-[var(--danger)]">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          <span>Richiesta non accolta. Non eseguire l&apos;intervento: contatta l&apos;ufficio.</span>
        </p>
        <Button variant="outline" size="touch" className="mt-3 w-full" onClick={() => window.location.reload()}>
          Aggiorna
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3"
      aria-live="polite"
    >
      <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--brand-text-main)]">
          {attive === 1 ? 'In attesa che l’ufficio assegni il misuratore.' : `In attesa di ${attive} assegnazioni.`}
        </p>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          Resta su questa pagina: appena è assegnato te lo diciamo qui. Non serve ricaricare.
        </p>
      </div>
    </div>
  );
}
