'use client';

import { createContext, useContext } from 'react';

/**
 * Funzione fornita da RapportinoForm per uploadare un singolo file foto
 * di un campo del rapportino. Restituisce il storage path oppure null.
 * I componenti interni (CampoInput tipo='foto') la usano via hook senza prop drilling.
 */
export type UploadFotoFn = (chiave: string, file: File) => Promise<string | null>;

const noop: UploadFotoFn = async () => null;

export const RapportinoFotoCtx = createContext<UploadFotoFn>(noop);

export function useUploadFoto(): UploadFotoFn {
  return useContext(RapportinoFotoCtx);
}
