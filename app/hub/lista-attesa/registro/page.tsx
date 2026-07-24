import { RegistroAutorizzazioni } from '@/components/modules/lista-attesa/RegistroAutorizzazioni';
import { ListaAttesaNav } from '@/components/modules/lista-attesa/ListaAttesaNav';
import { caricaDatiListaAttesa } from '@/lib/interventi/manuali/datiListaAttesa';

export const dynamic = 'force-dynamic';

export default async function RegistroAutorizzazioniPage() {
  const { campiPerCommittente } = await caricaDatiListaAttesa();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <ListaAttesaNav attivo="registro" />
      <RegistroAutorizzazioni campiPerCommittente={campiPerCommittente} />
    </main>
  );
}
