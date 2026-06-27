import { brandOgImage } from '@/lib/og/brandOgImage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dataItaliana } from '@/lib/brand';

// Anteprima (thumbnail) per la condivisione del link agenda operatore: stesso testo
// del messaggio (saluto col nome + istruzioni), personalizzato dal token.
export const runtime = 'nodejs';
export const alt = 'Agenda operatore — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  let headline = 'Ciao,';
  let body = 'Ecco la tua agenda di oggi. Tocca per vedere il giro di interventi e segnare gli esiti.';
  try {
    const { token } = await params;
    const { data: tok } = await supabaseAdmin
      .from('agenda_token')
      .select('staff_id, data')
      .eq('token', token)
      .maybeSingle();
    if (tok) {
      const { data: staff } = await supabaseAdmin
        .from('staff')
        .select('display_name')
        .eq('id', (tok as { staff_id: string }).staff_id)
        .maybeSingle();
      const nome = (staff as { display_name?: string | null } | null)?.display_name ?? '';
      headline = nome ? `Ciao ${nome},` : 'Ciao,';
      body = `Ecco la tua agenda del ${dataItaliana((tok as { data?: string }).data)}. Tocca per vedere il giro e segnare gli esiti.`;
    }
  } catch {
    /* fallback al testo generico */
  }
  return brandOgImage({ headline, body });
}
