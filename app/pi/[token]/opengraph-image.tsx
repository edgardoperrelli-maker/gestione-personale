import { brandOgImage } from '@/lib/og/brandOgImage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dataItaliana } from '@/lib/brand';

// Immagine di anteprima (thumbnail) per la condivisione del link P.I. su WhatsApp.
export const runtime = 'nodejs';
export const alt = 'Pronto Intervento — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  let headline = 'Pronto Intervento';
  let body = 'Sei di reperibilità: registra qui le chiamate ricevute sul campo. Apri il link e aggiungi una chiamata.';
  try {
    const { token } = await params;
    const { data: tok } = await supabaseAdmin
      .from('pi_token')
      .select('area_codice, valido_dal, valido_al, revocato_at')
      .eq('token', token)
      .maybeSingle();
    if (tok) {
      const { data: area } = await supabaseAdmin
        .from('pi_aree')
        .select('label')
        .eq('codice', (tok as { area_codice: string }).area_codice)
        .maybeSingle();
      const label = (area as { label?: string } | null)?.label;
      headline = label ? `Pronto Intervento · ${label}` : 'Pronto Intervento';
      body = (tok as { revocato_at?: string | null }).revocato_at
        ? 'Link revocato dall’ufficio. Contatta l’ufficio per il collegamento aggiornato.'
        : `Reperibilità attiva dal ${dataItaliana((tok as { valido_dal?: string }).valido_dal)} al ${dataItaliana((tok as { valido_al?: string }).valido_al)}. Registra qui le chiamate ricevute sul campo.`;
    }
  } catch {
    /* fallback al testo generico */
  }
  return brandOgImage({ headline, body });
}
