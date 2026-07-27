'use client';

import { useState } from 'react';
import Tabs from '@/components/Tabs';
import type { Famiglia } from '@/lib/acea/saracinesche';
import ImportCard from './ImportCard';
import RapportiniGiorno from './RapportiniGiorno';
import EsportaAcea from './EsportaAcea';
import Saracinesche from './Saracinesche';

const FAMIGLIE: Array<{ value: Famiglia; label: string }> = [
  { value: 'dunning', label: 'Dunning' },
  { value: 'massive', label: 'Limitazioni massive' },
];

/**
 * Strumenti della commessa: tutto ciò che si fa PRIMA e DOPO la pianificazione.
 *
 * Prima stavano in fondo alle viste Dunning e Massive, sotto la tabella. Erano quattro blocchi in
 * colonna alti insieme più di uno schermo: per arrivare ai rapportini si scorreva oltre una tabella
 * che scorreva già per conto suo, e le due viste ripetevano gli stessi blocchi.
 *
 * Qui stanno una volta sola. Import e rapportini valgono per l'intera commessa — un export alimenta
 * entrambe le famiglie, e un operatore con dunning e limitazioni massive lo stesso giorno ha un
 * rapportino solo. Export e saracinesche invece guardano una famiglia per volta: la scelta è un
 * `Tabs` sullo stesso dataset, non una pagina a parte (DESIGN.md §7bis).
 */
export default function StrumentiClient() {
  const [famiglia, setFamiglia] = useState<Famiglia>('dunning');
  const [aggiornamenti, setAggiornamenti] = useState(0);

  return (
    <div className="space-y-4">
      <ImportCard onImportato={() => setAggiornamenti((n) => n + 1)} />
      <RapportiniGiorno />

      <div className="space-y-3">
        <Tabs
          value={famiglia}
          onValueChange={(v) => setFamiglia(v as Famiglia)}
          items={FAMIGLIE}
        />
        {/*
          `key` sulla famiglia: export e saracinesche tengono stato interno legato alla famiglia
          (comuni caricati, vista selezionata). Senza il rimontaggio, passando a «massive» si
          vedrebbe per un istante il conteggio del dunning.

          Il contatore degli import sta in ENTRAMBE le chiavi: la tendina dei comuni dell'export si
          popola da `/api/acea/opzioni`, quindi un import che porta un comune nuovo lo lasciava
          fuori finché non si cambiava pagina.
        */}
        <EsportaAcea key={`export-${famiglia}-${aggiornamenti}`} famiglia={famiglia} />
        <Saracinesche key={`saracinesche-${famiglia}-${aggiornamenti}`} famiglia={famiglia} />
      </div>
    </div>
  );
}
