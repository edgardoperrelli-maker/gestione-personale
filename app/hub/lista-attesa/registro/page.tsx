import { RegistroAutorizzazioni } from '@/components/modules/lista-attesa/RegistroAutorizzazioni';
import { ListaAttesaNav } from '@/components/modules/lista-attesa/ListaAttesaNav';
import { caricaDatiListaAttesa } from '@/lib/interventi/manuali/datiListaAttesa';

export const dynamic = 'force-dynamic';

export default async function RegistroAutorizzazioniPage() {
  const { campiPerCommittente } = await caricaDatiListaAttesa();

  return (
    <div className="space-y-6">
      <ListaAttesaNav attivo="registro" />
      <RegistroAutorizzazioni campiPerCommittente={campiPerCommittente} />
    </div>
  );
}
