import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import MotionProvider from '@/components/layout/MotionProvider';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gestione Personale',
  description: 'Pianificazione operatori e rapportini.',
  icons: { apple: '/icons/apple-touch-icon.png' },
};

/* viewport-fit=cover: senza, su iPhone env(safe-area-inset-*) vale sempre 0 e la
   barra "Invia rapportino" finisce sotto l'indicatore home. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Colore barra browser/PWA: UNO solo, il canvas chiaro (valore di --app-bg light).
  // Tenere anche la variante dark avrebbe colorato di scuro la barra su un telefono col
  // sistema in dark, mentre la pagina sotto è chiara — una cornice che non c'entra nulla.
  themeColor: '#f0f4f7',
};

/**
 * `light` scritta direttamente sull'`<html>`: il tema scuro è stato abbandonato il
 * 2026-07-25 e l'app è chiara e sola. Prima c'era uno script inline che leggeva
 * `localStorage.theme` per evitare il lampo di tema al primo paint — senza una seconda
 * variante da scegliere non serve più, e una classe statica non può sbagliare.
 * I valori scuri restano in `globals.css` (`:root`), dormienti: i token non si rimuovono
 * (DESIGN.md §2) e riaccendere il dark resta possibile togliendo questa classe.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="light" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} antialiased bg-[var(--brand-bg)] text-[var(--brand-text-main)]`}>
        {/* Niente PageTransitionWrapper qui: con key={pathname} sull'intero albero
            ogni navigazione smontava e rimontava AppShell (sidebar, topbar, provider
            realtime, fetch annunci). La transizione vive nei layout hub/dashboard,
            dove avvolge solo il contenuto della pagina. */}
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
