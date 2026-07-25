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

/**
 * Variante del primitivo `Badge` (components/Badge.tsx) che porta lo stato del
 * rapportino. È una *variante*, non una stringa di classi: il badge si disegna
 * una volta sola, nel primitivo — prima ogni chiamante ricopiava a mano
 * `rounded-full px-2 py-0.5 …` e le copie divergevano (una era scesa a 9px).
 */
export type StatoBadgeVariante = 'ok' | 'ko' | 'warn';

export function statoBadge(
  stato: RapportinoStato['statoCalcolato'],
): { label: string; variant: StatoBadgeVariante } {
  // Token d'INTENTO (`--status-*`, dentro Badge) e non i semantici
  // `--success`/`--danger`/`--warning`: stessi valori, ma su una pill di stato
  // il colore *è* l'informazione (DESIGN.md §3).
  if (stato === 'inviato') return { label: 'Inviato', variant: 'ok' };
  if (stato === 'scaduto') return { label: 'Scaduto', variant: 'ko' };
  return { label: 'In corso', variant: 'warn' };
}

/**
 * Condivisione su WhatsApp: SOLO il link. Niente testo precompilato — il messaggio
 * (saluto, istruzioni, firma) è già dentro l'anteprima del link (immagine OG), così
 * non viene ripetuto due volte in chat.
 */
export function whatsappHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}
