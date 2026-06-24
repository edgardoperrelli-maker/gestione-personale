// PURE: costruzione storage_path unico per-tentativo + riconoscimento conflitto PK Postgres.

/** Path foto con suffisso per-tentativo: due POST concorrenti non scrivono mai sullo stesso oggetto. */
export function pathFotoTentativo(
  richiestaId: string,
  chiave: string,
  identificativo: string,
  tentativo: string,
  ext: string,
): string {
  return `${richiestaId}/${chiave}_${identificativo}_${tentativo}.${ext}`;
}

/** Conflitto di chiave primaria/unique (Postgres 23505) → la richiesta esiste già (duplicato concorrente). */
export function isViolazionePk(error: { code?: string } | null | undefined): boolean {
  return !!error && error.code === '23505';
}
