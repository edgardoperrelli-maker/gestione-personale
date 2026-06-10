import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type ScopeFoto = 'misuratore' | 'fase' | 'accessoria';
export type CampiScope = Record<ScopeFoto, TemplateCampo[]>;

/** Partiziona i campi `tipo='foto'` per scope (default 'misuratore'), ciascun gruppo ordinato per `ordine`. */
export function campiPerScope(campi: TemplateCampo[]): CampiScope {
  const out: CampiScope = { misuratore: [], fase: [], accessoria: [] };
  for (const c of campi) {
    if (c.tipo !== 'foto') continue;
    const scope: ScopeFoto = c.scope_foto ?? 'misuratore';
    out[scope].push(c);
  }
  (Object.keys(out) as ScopeFoto[]).forEach((k) => out[k].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)));
  return out;
}
