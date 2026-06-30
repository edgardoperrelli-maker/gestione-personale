// Verdetto "matricola già eseguita" per il blocco anti-duplicato al "+".
// PURO: nessun I/O. La matricola è bloccata se a sistema esiste già un esito POSITIVO
// (committenti ACEA: 'acea' = ODL, 'lim_massive' = manuali — vedi COMMITTENTI_BLOCCO nel route).
//
// Regole (decise con l'ufficio):
//  - Conta SOLO l'esito: un intervento ACEA con esito 'eseguito_positivo', oppure una voce di
//    rapportino con `eseguito = SI`.
//  - Lo STATO ordine (COMPLETATO) NON conta: un intervento completato con esito negativo
//    ("No"/"Nessun passaggio") NON blocca → l'operatore può procedere.
//  - "Vince il positivo": basta un positivo a sistema per bloccare; un esito negativo successivo
//    NON sblocca (l'upgrade negativo→positivo entra, il downgrade positivo→negativo no).

/** Matricola normalizzata: maiuscolo, solo A-Z0-9. Stessa logica del lookup limitazione. */
export function normMatricola(v: string): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type VerdettoEsecuzione = {
  bloccato: boolean;
  fonte?: 'db';
  odl?: string | null;
  data?: string | null;
  esecutore?: string | null;
};

/** Intervento già filtrato a monte come positivo (esito = 'eseguito_positivo', committente in scope). */
export type RigaInterventoPositivo = {
  odl?: string | null;
  matricola_contatore?: string | null;
  data?: string | null;
};

/** Voce di rapportino candidata: la positività è decisa qui (`eseguito = SI`). */
export type RigaVoce = {
  odl?: string | null;
  matricola?: string | null;
  data?: string | null;
  eseguito?: string | null;
};

const eseguitoSi = (v?: string | null) => String(v ?? '').trim().toUpperCase() === 'SI';

/** Decide il blocco confrontando per matricola NORMALIZZATA. Gli interventi in input sono già
 *  positivi (filtro esito + committente fatto dalla query); le voci sono grezze e qui si applica
 *  `eseguito = SI`. Vince il primo positivo trovato (interventi prima, poi voci). */
export function verdettoEsecuzione(
  q: string,
  interventiPositivi: RigaInterventoPositivo[],
  voci: RigaVoce[],
): VerdettoEsecuzione {
  const qn = normMatricola(q);
  const it = (interventiPositivi ?? []).find((r) => normMatricola(r.matricola_contatore ?? '') === qn);
  if (it) return { bloccato: true, fonte: 'db', odl: it.odl ?? null, data: it.data ?? null, esecutore: null };
  const vo = (voci ?? []).find((r) => normMatricola(r.matricola ?? '') === qn && eseguitoSi(r.eseguito));
  if (vo) return { bloccato: true, fonte: 'db', odl: vo.odl ?? null, data: vo.data ?? null, esecutore: null };
  return { bloccato: false };
}
