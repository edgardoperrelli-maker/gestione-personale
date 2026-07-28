import { AceaNav } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';
import RegistroAcea from '@/components/modules/acea/RegistroAcea';

export const dynamic = 'force-dynamic';

/**
 * Limitazioni massive: il master come lo si vede oggi, senza il file.
 *
 * Tabella unica con filtro comune nell'intestazione — 60 comuni nell'export, una vista per file
 * replicherebbe un limite di Excel che non abbiamo più. Nessuna colonna scadenza: questi ordini
 * non scadono.
 *
 * Import, export e saracinesche stanno in `/hub/acea/strumenti`: un solo file alimenta entrambe le
 * famiglie, e tenerli in fondo a questa pagina significava ripeterli identici sotto due tabelle.
 */
export default function AceaMassivePage() {
  // Modulo a schermo pieno, come Dunning: vedi il commento in `dunning/page.tsx`.
  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-2">
      <AceaNav attivo="massive" />
      <ContatoriAcea />
      <RegistroAcea famiglia="massive" />
    </div>
  );
}
