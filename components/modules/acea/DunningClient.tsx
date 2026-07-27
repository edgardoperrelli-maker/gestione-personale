'use client';

import { useState } from 'react';
import ImportCard from './ImportCard';
import ContatoriAcea from './ContatoriAcea';
import RegistroAcea from './RegistroAcea';

/**
 * Vista Dunning: import, contatori e registro degli ordini.
 *
 * Import e tabella condividono `aggiornamenti`: a fine import contatori e registro si ricaricano
 * senza che l'utente debba ricordarsi di aggiornare la pagina.
 */
export default function DunningClient() {
  const [aggiornamenti, setAggiornamenti] = useState(0);
  return (
    <div className="space-y-4">
      <ContatoriAcea refreshKey={aggiornamenti} />
      <ImportCard onImportato={() => setAggiornamenti((n) => n + 1)} />
      <RegistroAcea famiglia="dunning" refreshKey={aggiornamenti} />
    </div>
  );
}
