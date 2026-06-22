import type { ReactNode } from 'react';
import type { AppModuleKey } from '@/lib/moduleAccess';

/**
 * Icone per modulo, riusate dalla Sidebar e dalla Dashboard.
 * Set a linee sobrio (stroke currentColor, linecap/linejoin round), una icona
 * riconoscibile per ogni voce: Cronoprogramma=caschetto cantiere, Calendario Hotel=letto,
 * Pianificazione=mappa, Interventi=lente (cerca intervento), Live=georadar,
 * Lista attesa=lista+orologio, Appuntamenti=calendario+check, Misuratori=contatore,
 * Agente=robot, Performance=barre, Impostazioni=ingranaggio, Assegnazione AI=scintille.
 */
export const MODULE_ICONS: Record<AppModuleKey, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17.5h18" />
      <path d="M5 17.5v-1.5a7 7 0 0 1 14 0v1.5" />
      <path d="M10 16.5V9.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7.3" />
    </svg>
  ),
  'hotel-calendar': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
      <path d="M3 18h18" />
      <path d="M3 21v-4M21 21v-2" />
      <path d="M6 13v-1.5A1.5 1.5 0 0 1 7.5 10h3A1.5 1.5 0 0 1 12 11.5V13" />
    </svg>
  ),
  mappa: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  interventi: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  ),
  live: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5h18" />
      <rect x="9.5" y="4.5" width="5" height="3" rx="1" />
      <path d="M9 11.5q3 3 6 0" />
      <path d="M7 13.5q5 4 10 0" />
    </svg>
  ),
  'lista-attesa': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h9M4 12h6M4 18h5" />
      <circle cx="17.5" cy="15.5" r="4" />
      <path d="M17.5 13.7v1.8l1.3 1.3" />
    </svg>
  ),
  appuntamenti: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M9 14.8l2 2 4-4" />
    </svg>
  ),
  misuratori: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="4" width="15" height="15" rx="2.5" />
      <circle cx="12" cy="11.5" r="4.5" />
      <path d="M12 11.5 14.8 9.3" />
      <path d="M12 7.4v.6M16.1 11.5h-.6M12 15.6v-.6M7.9 11.5h.6" />
      <path d="M9 19v1.6M15 19v1.6" />
    </svg>
  ),
  agente: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="8" width="15" height="11" rx="2.5" />
      <path d="M12 4.5v3.5" />
      <circle cx="12" cy="3.5" r="1.4" />
      <path d="M9.5 13h.01M14.5 13h.01" />
      <path d="M9.5 16.5h5" />
    </svg>
  ),
  performance: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16h16" />
      <rect x="7" y="12" width="2.6" height="5" rx="1" />
      <rect x="11.7" y="8.5" width="2.6" height="8.5" rx="1" />
      <rect x="16.4" y="5.5" width="2.6" height="11.5" rx="1" />
    </svg>
  ),
  impostazioni: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.04A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.06 4.65a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9c0 .67.4 1.28 1.03 1.56H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.35 15Z" />
    </svg>
  ),
  'assegnazione-ai': (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 3.5l1.5 4 4 1.5-4 1.5L11 14.5 9.5 10.5 5.5 9l4-1.5z" />
      <path d="M18 13.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  ),
};

/** Icona "Dashboard / Home" usata in cima alla sidebar. */
export const DASHBOARD_HOME_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9 21v-6h6v6" />
  </svg>
);
