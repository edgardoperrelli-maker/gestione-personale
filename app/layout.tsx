import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gestione Personale',
  description: 'Pianificazione operatori e rapportini.',
};

/* viewport-fit=cover: senza, su iPhone env(safe-area-inset-*) vale sempre 0 e la
   barra "Invia rapportino" finisce sotto l'indicatore home. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${geist.variable} antialiased bg-[var(--brand-bg)] text-[var(--brand-text-main)]`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('theme')!=='dark')document.documentElement.classList.add('light');}catch(e){document.documentElement.classList.add('light');}})();`,
          }}
        />
        {/* Niente PageTransitionWrapper qui: con key={pathname} sull'intero albero
            ogni navigazione smontava e rimontava AppShell (sidebar, topbar, provider
            realtime, fetch annunci). La transizione vive nei layout hub/dashboard,
            dove avvolge solo il contenuto della pagina. */}
        {children}
      </body>
    </html>
  );
}
