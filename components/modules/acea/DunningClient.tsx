'use client';

import { useState } from 'react';
import ImportCard from './ImportCard';
import ContatoriAcea from './ContatoriAcea';

/**
 * Vista Dunning: import e contatori.
 *
 * La tabella di pianificazione arriva qui sopra (parte 5 del piano). Per ora la pagina serve a
 * caricare l'export e vedere il registro popolarsi: i contatori si aggiornano a fine import
 * senza ricaricare la pagina.
 */
export default function DunningClient() {
  const [aggiornamenti, setAggiornamenti] = useState(0);
  return (
    <div className="space-y-4">
      <ContatoriAcea refreshKey={aggiornamenti} />
      <ImportCard onImportato={() => setAggiornamenti((n) => n + 1)} />
      <p className="text-xs text-[var(--brand-text-muted)]">
        La tabella di pianificazione con filtri, selezione multipla e assegnazione in blocco è in
        arrivo in questa pagina.
      </p>
    </div>
  );
}
