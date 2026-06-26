import { ImageResponse } from 'next/og';

// Immagine di anteprima (thumbnail) per la condivisione del link P.I. su WhatsApp.
export const runtime = 'edge';
export const alt = 'Pronto Intervento — Plenzich S.p.A.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f2749 0%, #14223f 100%)',
          color: '#ffffff',
          padding: '72px 84px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 18, height: 64, background: '#3b82f6', borderRadius: 6, display: 'flex' }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: '#cbd5e1', marginLeft: 22, display: 'flex' }}>
            PLENZICH S.p.A.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.02, display: 'flex' }}>Pronto Intervento</div>
          <div style={{ fontSize: 44, color: '#93c5fd', marginTop: 18, display: 'flex' }}>
            Registrazione chiamate sul campo
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>
          Tocca il link per aprire il modulo e aggiungere una chiamata
        </div>
      </div>
    ),
    { ...size },
  );
}
