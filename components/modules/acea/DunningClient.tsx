'use client';

import { useState } from 'react';
import ImportCard from './ImportCard';
import ContatoriAcea from './ContatoriAcea';
import RegistroAcea from './RegistroAcea';
import RapportiniGiorno from './RapportiniGiorno';
import Saracinesche from './Saracinesche';

/**
 * Vista Dunning: import, contatori, registro degli ordini e rapportini del giorno.
 *
 * Import e tabella condividono `aggiornamenti`: a fine import contatori e registro si ricaricano
 * senza che l'utente debba ricordarsi di aggiornare la pagina.
 *
 * I rapportini stanno in fondo perché è l'ultimo passo della giornata: si pianifica in tabella e
 * poi si genera. La card lavora sul giorno, non sulla famiglia — un operatore con dunning e
 * limitazioni massive lo stesso giorno ha comunque un rapportino solo.
 */
export default function DunningClient() {
  const [aggiornamenti, setAggiornamenti] = useState(0);
  return (
    <div className="space-y-4">
      <ContatoriAcea refreshKey={aggiornamenti} />
      <ImportCard onImportato={() => setAggiornamenti((n) => n + 1)} />
      <RegistroAcea famiglia="dunning" refreshKey={aggiornamenti} />
      <RapportiniGiorno />
      <Saracinesche famiglia="dunning" />
    </div>
  );
}
