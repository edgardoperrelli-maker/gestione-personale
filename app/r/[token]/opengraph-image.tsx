import { brandOgImage } from '@/lib/og/brandOgImage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dataItaliana } from '@/lib/brand';

// Anteprima (thumbnail) per la condivisione del link rapportino: mostra lo stesso
// testo del messaggio (saluto col nome + istruzioni), personalizzato dal token.
export const runtime = 'nodejs';
export const alt = 'Rapportino — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  let headline = 'Ciao,';
  let body = 'Ecco il tuo rapportino. Aprilo dal telefono, compila gli esiti e invialo a fine giornata.';
  try {
    const { token } = await params;
    const { data } = await supabaseAdmin
      .from('rapportini')
      .select('staff_name, data')
      .eq('token', token)
      .maybeSingle();
    if (data) {
      const nome = (data as { staff_name?: string | null }).staff_name ?? '';
      headline = nome ? `Ciao ${nome},` : 'Ciao,';
      body = `Ecco il tuo rapportino del ${dataItaliana((data as { data?: string }).data)}. Aprilo dal telefono, compila gli esiti e invialo a fine giornata.`;
    }
  } catch {
    /* fallback al testo generico */
  }
  return brandOgImage({ headline, body });
}
