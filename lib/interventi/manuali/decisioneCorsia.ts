// PURA: dalla riga lucchetto di (piano_id, staff_id) decide la corsia della richiesta manuale.
// 'liberi' SOLO se manuali_liberi === true (opt-in esplicito); altrimenti 'normale'
// (riga assente, campo assente/null/false). L'I/O (lettura riga) sta nella route.
import type { CorsiaRichiesta } from './types';

export type RigaLucchettoLiberi = { manuali_liberi?: boolean | null } | null | undefined;

export function decisioneCorsia(riga: RigaLucchettoLiberi): CorsiaRichiesta {
  return riga?.manuali_liberi === true ? 'liberi' : 'normale';
}
