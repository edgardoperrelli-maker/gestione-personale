import { normMatricola } from './matricoleSimili';

export type VoceMatricola = { id: string; matricola?: string | null; via?: string | null; comune?: string | null };

/** Prima voce con matricola normalizzata uguale a `q` (match esatto), o null. Ignora voci senza matricola. */
export function matchVociMatricola<T extends VoceMatricola>(voci: T[], q: string): T | null {
  const nq = normMatricola(q);
  if (!nq) return null;
  return voci.find((v) => v.matricola != null && normMatricola(v.matricola) === nq) ?? null;
}
