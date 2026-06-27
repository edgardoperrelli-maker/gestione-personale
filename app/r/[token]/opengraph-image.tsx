import { brandOgImage } from '@/lib/og/brandOgImage';

// Anteprima (thumbnail) per la condivisione del link rapportino su WhatsApp/Telegram.
export const runtime = 'edge';
export const alt = 'Rapportino — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return brandOgImage({
    title: 'Rapportino',
    subtitle: 'Interventi della giornata',
    footer: 'Tocca il link per compilare gli esiti e inviare',
  });
}
