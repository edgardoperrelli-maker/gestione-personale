import { brandOgImage } from '@/lib/og/brandOgImage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dataItaliana } from '@/lib/brand';

// Anteprima (thumbnail) per la condivisione del link agenda operatore: pill in
// risalto con esecutore · data della giornata, personalizzata dal token.
export const runtime = 'nodejs';
export const alt = 'Agenda operatore — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const headline = 'La tua agenda';
  let subtitle: string | undefined;
  const body = 'Tocca per vedere il giro di interventi e segnare gli esiti.';
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
      const giorno = dataItaliana((tok as { data?: string }).data);
      subtitle = [nome, giorno].filter(Boolean).join(' · ') || undefined;
    }
  } catch {
    /* fallback senza pill */
  }
  return brandOgImage({ headline, subtitle, body });
}
