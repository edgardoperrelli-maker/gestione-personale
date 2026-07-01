// PURA: normalizza una data grezza in 'YYYY-MM-DD'; null se non parsabile.
// Gestisce: ISO ('2026-06-19 00:00:00'), DD/MM/YYYY, e il formato Date JS/Excel prodotto dalla
// "data prevista" delle righe manuali (es. "Fri Jun 19 2026 02:00:00 GMT+0200 (Ora legale…)").
export function dataDaRaw(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Fallback Date JS/Excel: rimuove il commento fra parentesi finale e usa la data UTC
  // (le date Excel sono a mezzanotte UTC → il giorno resta stabile su qualsiasi fuso).
  const d = new Date(s.replace(/\s*\([^)]*\)\s*$/, ''));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
