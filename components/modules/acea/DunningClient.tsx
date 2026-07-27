'use client';

import ContatoriAcea from './ContatoriAcea';
import RegistroAcea from './RegistroAcea';

/**
 * Vista Dunning: contatori di testa e registro degli ordini. Nient'altro.
 *
 * Fino al ridisegno del 2026-07-27 questa pagina impilava sei blocchi — contatori, import, registro,
 * rapportini, export, saracinesche — per un'altezza di oltre due schermi. La tabella, che è il
 * lavoro, stava in mezzo e scorreva dentro una pagina che scorreva: per pianificare si scorreva
 * verso il basso, e per generare i rapportini si scorreva oltre la tabella.
 *
 * Import, rapportini, export e saracinesche vivono ora in `/hub/acea/strumenti`: si aprono a inizio
 * e a fine giornata, non mentre si assegna. Qui resta una pagina che sta in uno schermo, dove
 * l'unica cosa che scorre è la tabella.
 */
export default function DunningClient() {
  return (
    <div className="space-y-3">
      <ContatoriAcea />
      <RegistroAcea famiglia="dunning" />
    </div>
  );
}
