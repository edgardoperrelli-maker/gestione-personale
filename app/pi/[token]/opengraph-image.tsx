import { brandOgImage } from '@/lib/og/brandOgImage';

// Immagine di anteprima (thumbnail) per la condivisione del link P.I. su WhatsApp.
export const runtime = 'edge';
export const alt = 'Pronto Intervento — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return brandOgImage({
    title: 'Pronto Intervento',
    subtitle: 'Registrazione chiamate sul campo',
    footer: 'Tocca il link per aprire il modulo e aggiungere una chiamata',
  });
}
