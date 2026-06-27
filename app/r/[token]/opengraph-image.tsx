import { brandOgImage } from '@/lib/og/brandOgImage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dataItaliana } from '@/lib/brand';

// Anteprima (thumbnail) per la condivisione del link rapportino: pill in risalto
// con esecutore · data della giornata, personalizzata dal token.
export const runtime = 'nodejs';
export const alt = 'Rapportino — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const headline = 'Il tuo rapportino';
  let subtitle: string | undefined;
  const body = 'Aprilo dal telefono, compila gli esiti e invialo a fine giornata.';
  try {
    const { token } = await params;
    const { data } = await supabaseAdmin
      .from('rapportini')
      .select('staff_name, data')
      .eq('token', token)
      .maybeSingle();
    if (data) {
      const nome = (data as { staff_name?: string | null }).staff_name ?? '';
      const giorno = dataItaliana((data as { data?: string }).data);
      subtitle = [nome, giorno].filter(Boolean).join(' · ') || undefined;
    }
  } catch {
    /* fallback senza pill */
  }
  return brandOgImage({ headline, subtitle, body, tone: 'blu' });
}
