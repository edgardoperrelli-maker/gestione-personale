import { caricaCommittenti, caricaListino } from '@/lib/contratti/dati';
import { committentiAttivi } from '@/lib/contratti/tipi';
import PrezziClient, { type ContrattoOpzione } from './PrezziClient';

export const dynamic = 'force-dynamic';

export default async function PrezziPage() {
  const [committenti, listino] = await Promise.all([caricaCommittenti(), caricaListino()]);

  // La tabella ragiona per COMMESSA, non per gerarchia: si appiattisce qui una volta
  // sola, così il client non deve riattraversare committenti → contratti a ogni render.
  const contratti: ContrattoOpzione[] = committentiAttivi(committenti).flatMap((c) =>
    (c.contratti ?? []).map((k) => ({
      id: k.id,
      etichetta: `${c.nome} · ${k.nome}`,
      valido_dal: k.valido_dal,
    })),
  );

  return <PrezziClient initial={listino} contratti={contratti} />;
}
