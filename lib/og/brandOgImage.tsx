import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';

/** Fiamma del marchio, disegnata vettoriale così l'anteprima è brandizzata
 *  anche senza caricare file esterni (compatibile con il renderer di next/og). */
function Fiamma({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <rect x="40" y="34" width="86" height="10" rx="5" transform="rotate(36 40 34)" fill="#1e3a63" />
      <path
        d="M50 8 C 61 25, 65 32, 56 46 C 65 41, 68 33, 68 33 C 78 51, 69 78, 49 78 C 30 78, 23 60, 34 44 C 37 52, 42 52, 42 52 C 34 35, 39 19, 50 8 Z"
        fill={BRAND.colori.rosso}
      />
    </svg>
  );
}

/**
 * Genera l'immagine di anteprima (1200×630) condivisa da tutti i link operatore.
 * Stesso "vestito" brandizzato — logo, titolo del modulo, sottotitolo, call-to-action —
 * così ogni link incollato su WhatsApp/Telegram mostra una card riconoscibile.
 */
export function brandOgImage(opts: {
  title: string;
  subtitle?: string;
  footer?: string;
  size?: { width: number; height: number };
}) {
  const C = BRAND.colori;
  const size = opts.size ?? { width: 1200, height: 630 };
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
        {/* Intestazione: fiamma + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Fiamma size={66} />
          <div style={{ display: 'flex', alignItems: 'baseline', marginLeft: 20 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: C.rosso, display: 'flex' }}>P</span>
            <span style={{ fontSize: 36, fontWeight: 800, color: C.grigioChiaro, display: 'flex' }}>LENZICH</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.grigioTenue, marginLeft: 12, display: 'flex' }}>
              S.p.A.
            </span>
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
