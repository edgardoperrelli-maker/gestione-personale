import { brandOgImage } from '@/lib/og/brandOgImage';

// Anteprima (thumbnail) per la condivisione del link agenda operatore su WhatsApp/Telegram.
export const runtime = 'edge';
export const alt = 'Agenda operatore — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return brandOgImage({
    title: 'La tua agenda',
    subtitle: 'Il giro di interventi di oggi',
    footer: 'Tocca il link per vedere il giro e segnare gli esiti',
  });
}
