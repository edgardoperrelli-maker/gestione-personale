import { AceaNav } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';
import EsportaAcea from '@/components/modules/acea/EsportaAcea';
import RapportiniGiorno from '@/components/modules/acea/RapportiniGiorno';
import RegistroAcea from '@/components/modules/acea/RegistroAcea';
import Saracinesche from '@/components/modules/acea/Saracinesche';

export const dynamic = 'force-dynamic';

/**
 * Limitazioni massive: il master come lo si vede oggi, senza il file.
 *
 * Tabella unica con filtro comune — 60 comuni nell'export, una vista per file replicherebbe un
 * limite di Excel che non abbiamo più. Nessuna colonna scadenza: questi ordini non scadono.
 * L'import è condiviso e sta nella vista Dunning: un solo file alimenta entrambe le famiglie.
 */
export default function AceaMassivePage() {
  return (
    <div className="space-y-6">
      <AceaNav attivo="massive" />
      <ContatoriAcea />
      <RegistroAcea famiglia="massive" />
      <RapportiniGiorno />
      <EsportaAcea famiglia="massive" />
      <Saracinesche famiglia="massive" />
    </div>
  );
}
