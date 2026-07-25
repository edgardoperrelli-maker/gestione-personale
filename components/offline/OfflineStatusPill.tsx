/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStatoSync } from '@/lib/offline/useStatoSync';

/**
 * Striscia di STATO sincronizzazione per le pagine operatore (sola lettura):
 * offline / in attesa / da risolvere.
 * L'azione "Sincronizza" è nel FAB flottante (FabSync), sopra la lente e il "+".
 *
 * ⚠️ Quando è tutto sincronizzato e online, la striscia NON si monta: costava 45px in
 * cima allo schermo — mezza voce di lista — per dire «va tutto bene», che è l'assenza
 * di notizie, non una notizia (DESIGN.md §7quater: la cromatura fissa è un budget).
 * Lo stato "verde" resta comunque leggibile nel FAB di sincronizzazione, che è sempre
 * a schermo: qui si parla solo quando c'è qualcosa da dire.
 */
export function OfflineStatusPill({ token }: { token: string }) {
  const { inAttesa, bloccati, online } = useStatoSync(token);

  if (bloccati === 0 && inAttesa === 0 && online) return null;

  let testo: ReactNode;
  let cls: string;
  // Icone lucide a currentColor (DESIGN.md §7quater): al sole e in monocromia i
  // pallini colorati da soli non si distinguono, la forma sì.
  let Icona: LucideIcon;
  if (bloccati > 0) {
    testo = <><span className="font-mono tabular-nums">{bloccati}</span> da risolvere</>;
    cls = 'bg-[var(--danger-soft)] text-[var(--danger)]';
    Icona = AlertTriangle;
  } else if (inAttesa > 0) {
    testo = online
      ? <>Sincronizzazione… (<span className="font-mono tabular-nums">{inAttesa}</span>)</>
      : <>Offline · <span className="font-mono tabular-nums">{inAttesa}</span> in attesa</>;
    // `--warning-fg` non esiste: rendeva l'hex #92400e fisso in entrambi i temi.
    // Ora `--status-warn`, il token d'INTENTO «warn / in attesa» (§3): questa pill dice
    // uno STATO, quindi il colore è informazione — coerente con i rami ok/ko qui sotto.
    cls = 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]';
    Icona = online ? RefreshCw : WifiOff;
  } else {
    // Unico caso che resta dopo l'early return: coda vuota ma senza rete. Vale dirlo —
    // l'operatore deve sapere che sta lavorando in locale, anche se non ha nulla in attesa.
    testo = 'Offline';
    cls = 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]';
    Icona = WifiOff;
  }

  return (
    <div className="mx-auto flex max-w-[480px] items-center justify-center px-3 py-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`} aria-live="polite">
        <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
        {testo}
      </span>
    </div>
  );
}