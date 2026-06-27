import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';
import {
  BRAND_LOGO_DATA_URI,
  BRAND_LOGO_W,
  BRAND_LOGO_H,
  GESTILAB_G_DATA_URI,
  GESTILAB_G_W,
  GESTILAB_G_H,
} from '@/lib/og/brandLogo';

/**
 * Genera l'immagine di anteprima (1200×630) condivisa da tutti i link operatore.
 * Sfondo bianco, logo Plenzich reale a sinistra e "G" Gestilab (più piccola) a destra;
 * al centro lo stesso testo del messaggio che mandiamo all'operatore, in coda la firma.
 */
export function brandOgImage(opts: {
  headline: string;
  body: string;
  footer?: string;
  size?: { width: number; height: number };
}) {
  const C = BRAND.colori;
  const size = opts.size ?? { width: 1200, height: 630 };
  const logoH = 84;
  const logoW = Math.round((BRAND_LOGO_W * logoH) / BRAND_LOGO_H);
  // "G" Gestilab volutamente piccola: è il mark del fornitore, non deve competere col logo Plenzich.
  const gH = 54;
  const gW = Math.round((GESTILAB_G_W * gH) / GESTILAB_G_H);
  const footer = opts.footer ?? BRAND.firma;
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '60px 84px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Riga loghi: Plenzich a sinistra, "G" Gestilab (piccola) a destra */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI inline per next/og */}
          <img src={BRAND_LOGO_DATA_URI} width={logoW} height={logoH} alt={BRAND.nomeLegale} />
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI inline per next/og */}
          <img src={GESTILAB_G_DATA_URI} width={gW} height={gH} alt="Gestilab" />
        </div>

        {/* Testo del messaggio */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 58, fontWeight: 800, color: C.navy, lineHeight: 1.1, display: 'flex' }}>
            {opts.headline}
          </div>
          <div style={{ fontSize: 38, color: '#51607a', lineHeight: 1.32, marginTop: 20, maxWidth: 980 }}>
            {opts.body}
          </div>
        </div>

        {/* Firma */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#8a9aa1' }}>
          <div style={{ width: 14, height: 36, background: C.rosso, borderRadius: 5, display: 'flex' }} />
          <div style={{ marginLeft: 18, display: 'flex' }}>{`— ${footer}`}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
