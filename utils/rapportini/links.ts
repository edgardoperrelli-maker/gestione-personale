import { BRAND } from '@/lib/brand';

export interface RapportinoStato {
  id: string;
  staff_id: string;
  staff_name: string | null;
  token: string;
  stato: string;
  data: string;
  expires_at: string;
  submitted_at: string | null;
  template_id?: string | null;
  url: string;
  statoCalcolato: 'valido' | 'scaduto' | 'inviato';
  nVoci: number;
  fotoInSospeso?: number;
}

export function statoBadge(
  stato: RapportinoStato['statoCalcolato'],
): { label: string; className: string } {
  if (stato === 'inviato') {
    return { label: 'Inviato', className: 'bg-[var(--success-soft)] text-[var(--success)]' };
  }
  if (stato === 'scaduto') {
    return { label: 'Scaduto', className: 'bg-[var(--danger-soft)] text-[var(--danger)]' };
  }
  return { label: 'In corso', className: 'bg-[var(--warning-soft)] text-[var(--warning)]' };
}

export function whatsappHref(
  staffName: string | null,
  dataLabel: string,
  url: string,
): string {
  const saluto = staffName ? `Ciao ${staffName} 👋` : 'Ciao 👋';
  const testo = [
    saluto,
    `Ecco il tuo rapportino del ${dataLabel}.`,
    'Aprilo dal telefono, compila gli esiti e invialo a fine giornata 👇',
    url,
    '',
    `— ${BRAND.firma}`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(testo)}`;
}
