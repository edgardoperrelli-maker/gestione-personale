import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';
import { BRAND_LOGO_DATA_URI, BRAND_LOGO_W, BRAND_LOGO_H } from '@/lib/og/brandLogo';

/**
 * Genera l'immagine di anteprima (1200×630) condivisa da tutti i link operatore.
 * Mostra il LOGO REALE dell'azienda (lo stesso file caricato, sfondo trasparente)
 * dentro un badge bianco, così resta nitido e leggibile sul fondo navy — l'identità
 * del marchio è preservata su ogni link incollato in chat.
 */
export function brandOgImage(opts: {
  title: string;
  subtitle?: string;
  footer?: string;
  size?: { width: number; height: number };
}) {
  const C = BRAND.colori;
  const size = opts.size ?? { width: 1200, height: 630 };
  const logoH = 66;
  const logoW = Math.round((BRAND_LOGO_W * logoH) / BRAND_LOGO_H);
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyScuro} 100%)`,
          color: '#ffffff',
          padding: '72px 84px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo reale dentro un badge bianco */}
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#ffffff',
              borderRadius: 18,
              padding: '16px 26px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI inline per next/og */}
            <img src={BRAND_LOGO_DATA_URI} width={logoW} height={logoH} alt={BRAND.nomeLegale} />
          </div>
        </div>

        {/* Titolo del modulo + sottotitolo */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.03, display: 'flex' }}>{opts.title}</div>
          {opts.subtitle && (
            <div style={{ fontSize: 44, color: C.azzurro, marginTop: 18, display: 'flex' }}>{opts.subtitle}</div>
          )}
        </div>

        {/* Call to action */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: C.grigioTenue }}>
          <div style={{ width: 14, height: 36, background: C.rosso, borderRadius: 5, display: 'flex' }} />
          <div style={{ marginLeft: 18, display: 'flex' }}>{opts.footer ?? 'Tocca il link per aprire'}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
