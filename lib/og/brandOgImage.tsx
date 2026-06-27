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
 * Sfondo bianco con il LOGO REALE Plenzich in alto a sinistra (identico al file) e
 * la "G" di Gestilab in alto a destra. Identità del marchio preservata su ogni link.
 */
export function brandOgImage(opts: {
  title: string;
  subtitle?: string;
  footer?: string;
  size?: { width: number; height: number };
}) {
  const C = BRAND.colori;
  const size = opts.size ?? { width: 1200, height: 630 };
  const logoH = 92;
  const logoW = Math.round((BRAND_LOGO_W * logoH) / BRAND_LOGO_H);
  const gH = 104;
  const gW = Math.round((GESTILAB_G_W * gH) / GESTILAB_G_H);
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
          padding: '64px 84px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Riga loghi: Plenzich a sinistra, "G" Gestilab a destra */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI inline per next/og */}
          <img src={BRAND_LOGO_DATA_URI} width={logoW} height={logoH} alt={BRAND.nomeLegale} />
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI inline per next/og */}
          <img src={GESTILAB_G_DATA_URI} width={gW} height={gH} alt="Gestilab" />
        </div>

        {/* Titolo del modulo + sottotitolo */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.03, color: C.navy, display: 'flex' }}>
            {opts.title}
          </div>
          {opts.subtitle && (
            <div style={{ fontSize: 44, color: '#51607a', marginTop: 18, display: 'flex' }}>{opts.subtitle}</div>
          )}
        </div>

        {/* Call to action */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#8a9aa1' }}>
          <div style={{ width: 14, height: 36, background: C.rosso, borderRadius: 5, display: 'flex' }} />
          <div style={{ marginLeft: 18, display: 'flex' }}>{opts.footer ?? 'Tocca il link per aprire'}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
