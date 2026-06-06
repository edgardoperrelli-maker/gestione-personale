// PURA: normalizza i query param della lista admin in un filtro validato.
// stato='tutti' → null (nessun filtro). Date non ISO → null. Stato ignoto → in_attesa.
import { STATI_RICHIESTA, type StatoRichiesta } from './types';

export type FiltroLista = {
  stato: StatoRichiesta | null;
  from: string | null;
  to: string | null;
  staff: string | null;
};

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseFiltroLista(sp: URLSearchParams): FiltroLista {
  const rawStato = sp.get('stato');
  let stato: StatoRichiesta | null;
  if (rawStato === 'tutti') stato = null;
  else if (rawStato && (STATI_RICHIESTA as readonly string[]).includes(rawStato)) stato = rawStato as StatoRichiesta;
  else stato = 'in_attesa';

  const from = sp.get('from');
  const to = sp.get('to');
  const staff = (sp.get('staff') ?? '').trim();

  return {
    stato,
    from: from && isIsoDate(from) ? from : null,
    to: to && isIsoDate(to) ? to : null,
    staff: staff === '' ? null : staff,
  };
}
