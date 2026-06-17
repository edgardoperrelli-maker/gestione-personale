import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Confronto byte-safe (timing-safe) della chiave export.
 * Legge `LIM_MASSIVE_EXPORT_KEY` dall'ambiente e la confronta con l'header
 * `x-export-key`. Estratta da app/api/export/limitazioni-massive/route.ts per
 * essere riusata da export + /api/agente/tick + /api/agente/report.
 */
export function chiaveValida(req: Request): boolean {
  const atteso = process.env.LIM_MASSIVE_EXPORT_KEY ?? '';
  const fornito = req.headers.get('x-export-key') ?? '';
  if (!atteso) return false;
  const a = Buffer.from(atteso);
  const f = Buffer.from(fornito);
  if (f.length !== a.length) return false;
  try {
    return timingSafeEqual(f, a);
  } catch {
    return false;
  }
}
