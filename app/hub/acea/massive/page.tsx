import { gatePagina } from '@/lib/auth/gatePagina';
import { AceaNav } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';
import RegistroAcea from '@/components/modules/acea/RegistroAcea';
import { comuniMassiveAperti } from '@/lib/acea/caricaComuniMassive';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Limitazioni massive: il master come lo si vede oggi, senza il file.
 *
 * Una SCHEDA PER COMUNE con il lavoro da pianificare di quel paese, più «Chiusi» e «Sostituzione
 * saracinesca» riepilogative: le massive sono campagne per paese, e il filtro comune a ogni giro
 * era il gesto più ripetuto della vista. Nessuna colonna scadenza: questi ordini non scadono.
 *
 * I comuni si leggono QUI, sul server, e viaggiano come prop: il registro deve sapere le schede
 * prima della prima interrogazione — scoprirle dalla risposta significherebbe mostrare per un
 * attimo gli aperti di tutti i paesi sotto il tasto del primo. Best-effort: senza lettura si
 * parte dai «Chiusi» e la fila arriva con la prima risposta della lista.
 *
 * Import, export e saracinesche stanno in `/hub/acea/strumenti`: un solo file alimenta entrambe le
 * famiglie, e tenerli in fondo a questa pagina significava ripeterli identici sotto due tabelle.
 */
export default async function AceaMassivePage() {
  // PRIMA del dato, non dopo: leggere i comuni per poi rimandare via chi non può vederli
  // significa aver già interrogato il registro del committente per conto suo.
  await gatePagina('/hub/acea/massive');
  const comuni = await comuniMassiveAperti(supabaseAdmin).catch((e) => {
    console.error('[acea/massive] comuni non letti:', e);
    return [];
  });
  // Modulo a schermo pieno, come Dunning: vedi il commento in `dunning/page.tsx`.
  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-2">
      <AceaNav attivo="massive" />
      <ContatoriAcea famiglia="massive" />
      <RegistroAcea famiglia="massive" comuniIniziali={comuni} />
    </div>
  );
}
