// utils/date-it.ts
const TZ = 'Europe/Rome';

// YYYY-MM-DD in locale Rome, senza UTC shift
export function ymdLocal(d: Date): string {
  const y = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric' }).format(d);
  const m = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, month: '2-digit' }).format(d);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, day: '2-digit' }).format(d);
  return `${y}-${m}-${day}`;
}

export function isTodayLocal(d: Date): boolean {
  return ymdLocal(d) === ymdLocal(new Date());
}

function easterY(year: number): Date {
  // Algoritmo Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  // Crea data alle 12:00 per evitare shift, poi forza TZ con ymdLocal in confronto
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isItalyHoliday(d: Date): boolean {
  // Confronto su stringhe YYYY-MM-DD in locale Rome
  const s = ymdLocal(d);
  const y = Number(s.slice(0, 4));

  // Feste fisse
  const fixed = new Set<string>([
    `${y}-01-01`, // Capodanno
    `${y}-01-06`, // Epifania
    `${y}-04-25`, // Liberazione
    `${y}-05-01`, // Lavoro
    `${y}-06-02`, // Repubblica
    `${y}-08-15`, // Ferragosto
    `${y}-11-01`, // Tutti i Santi
    `${y}-12-08`, // Immacolata
    `${y}-12-25`, // Natale
    `${y}-12-26`, // Santo Stefano
  ]);

  if (fixed.has(s)) return true;

  // Pasqua e Lunedì dell’Angelo
  const easter = easterY(y);
  const pasquetta = new Date(easter);
  pasquetta.setDate(pasquetta.getDate() + 1);

  const easterYmd = ymdLocal(easter);
  const pasquettaYmd = ymdLocal(pasquetta);

  return s === easterYmd || s === pasquettaYmd;
}

export function isWeekend(d: Date): boolean {
  // 0=Dom, 6=Sab in locale; JS usa locale-agnostic day, ma il giorno è corretto se la data è locale
  const dow = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getDay();
  return dow === 0 || dow === 6;
}
