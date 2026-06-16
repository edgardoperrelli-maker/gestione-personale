import { RegistroAutorizzazioni } from '@/components/modules/lista-attesa/RegistroAutorizzazioni';
import { ListaAttesaNav } from '@/components/modules/lista-attesa/ListaAttesaNav';
import { caricaDatiListaAttesa } from '@/lib/interventi/manuali/datiListaAttesa';

export const dynamic = 'force-dynamic';

export default async function RegistroAutorizzazioniPage() {
  const { campiPerCommittente } = await caricaDatiListaAttesa();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>Lista attesa</h1>
        <ListaAttesaNav attivo="registro" />
      </header>
      <RegistroAutorizzazioni campiPerCommittente={campiPerCommittente} />
    </main>
  );
}
