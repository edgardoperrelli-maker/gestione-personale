import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gestione Personale',
  description: 'Pianificazione operatori e rapportini.',
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
