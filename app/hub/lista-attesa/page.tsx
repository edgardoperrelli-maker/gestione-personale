import { CodaRichiesteManuali } from '@/components/modules/lista-attesa/CodaRichiesteManuali';
import { ListaAttesaNav } from '@/components/modules/lista-attesa/ListaAttesaNav';
import { caricaDatiListaAttesa } from '@/lib/interventi/manuali/datiListaAttesa';

export const dynamic = 'force-dynamic';

export default async function ListaAttesaPage() {
  const { userId, infoCampi, infoCampiPerCommittente, campiPerCommittente, adminNomi, tassonomia } = await caricaDatiListaAttesa();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <ListaAttesaNav attivo="richieste" />
      <CodaRichiesteManuali infoCampi={infoCampi} infoCampiPerCommittente={infoCampiPerCommittente} campiPerCommittente={campiPerCommittente} userId={userId} adminNomi={adminNomi} tassonomia={tassonomia} />
    </main>
  );
}
