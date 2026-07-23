/**
 * Configurazione brand centralizzata.
 *
 * Tutto ciò che rende "riconoscibili" e caldi i link che condividiamo col personale
 * (nome azienda, logo, colori, tono dei messaggi) si modifica QUI, in un punto solo:
 * pagine operatore, anteprime dei link su WhatsApp (Open Graph) e messaggi precompilati
 * pescano da queste costanti.
 */
export const BRAND = {
  /** Wordmark breve. */
  nome: 'PLENZICH',
  /** Ragione sociale completa. */
  nomeLegale: 'PLENZICH S.p.A.',
  /** Sottotitolo mostrato sotto il logo nelle pagine che apre l'operatore. */
  tagline: 'Gestione interventi sul campo',
  /**
   * Logo aziendale (PNG con sfondo reso trasparente, in /public). Per cambiarlo
   * basta sostituire questo singolo file mantenendo lo stesso percorso: tutta
   * l'app si aggiorna. Va mostrato su sfondo chiaro (vedi BrandHeader): la scritta
   * è blu scuro e su fondo scuro non sarebbe leggibile.
   */
  logo: '/brand/logo-plenzich.png',
  /** Solo il simbolo (fiamma), per spazi stretti. */
  mark: '/brand/mark.svg',
  /** Palette del brand, usata per disegnare le immagini di anteprima (Open Graph). */
  colori: {
    rosso: '#E1251B',
    navy: '#13243f',
    navyScuro: '#0f1d33',
    grigioChiaro: '#cbd5e1',
    grigioTenue: '#94a3b8',
    azzurro: '#9fb2d4',
    /** Blu del logo Gestilab (accento su sfondo chiaro) + tinta soft per le pill. */
    gestilabBlu: '#0596BC',
    gestilabBluSoft: '#e6f6fb',
  },
  /** Firma usata in coda ai messaggi di condivisione (WhatsApp ecc.). */
  firma: 'Ufficio Plenzich',
} as const;

/**
 * URL base pubblico dell'app, per costruire link assoluti lato server
 * (anteprime Open Graph, e-mail, ecc.). Centralizza la logica che prima era
 * duplicata nelle singole pagine.
 */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    // Dominio di produzione PUBBLICO (Vercel lo espone sempre). Va usato per le URL
    // assolute delle anteprime (og:image): VERCEL_URL è invece l'host SPECIFICO del
    // deploy, protetto da SSO/Deployment Protection → i crawler (WhatsApp) vengono
    // rediretti al login e l'immagine non si carica.
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gestione-personale.vercel.app')
  );
}

/** Converte una data ISO (YYYY-MM-DD) nel formato italiano GG/MM/AAAA. */
export function dataItaliana(iso?: string | null): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

/**
 * Palette unica per gli export "stampati" (PDF jspdf in RGB, Excel exceljs in
 * ARGB). Prima ogni generatore duplicava i propri valori (3 palette PDF
 * diverse, navy Excel FF0F2749 ≠ brand #13243f): questa è la fonte sola.
 * Sono colori di documento, volutamente indipendenti dai token CSS del tema.
 */
export const BRAND_EXPORT = {
  /** Testo principale dei PDF. */
  inkRgb: [26, 35, 48] as [number, number, number],
  /** Testo secondario dei PDF. */
  mutedRgb: [91, 103, 117] as [number, number, number],
  /** Righe/divisori dei PDF. */
  lineRgb: [227, 232, 238] as [number, number, number],
  /** Accento di stampa (blu GestiLab). */
  accentRgb: [10, 143, 176] as [number, number, number],
  /** Header tabelle Excel = navy brand (#13243f). */
  navyArgb: 'FF13243F',
} as const;
