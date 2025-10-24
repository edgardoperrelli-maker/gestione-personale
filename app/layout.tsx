import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono  = Roboto_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = { title: 'Create Next App', description: '...' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
