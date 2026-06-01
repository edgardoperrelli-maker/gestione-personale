import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { PageTransitionWrapper } from '@/components/layout/PageTransitionWrapper';
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
            __html: `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
          }}
        />
        <PageTransitionWrapper>{children}</PageTransitionWrapper>
      </body>
    </html>
  );
}
