// PURA: normalizza il testo dell'attività ACEA (intervento_tipo / "Operazione testo breve") in una
// CHIAVE canonica (maiuscolo, senza accenti, spazi collassati) + un'etichetta leggibile. La chiave è
// l'aggancio del listino per attività: due testi che differiscono solo per maiuscole/accenti/spazi
// finiscono sulla stessa tariffa. Testi diversi restano attività distinte (nessun raggruppamento a caso).

export interface AttivitaNorm {
  key: string;
  etichetta: string;
}

export function normalizzaAttivita(tipo: string | null | undefined): AttivitaNorm | null {
  const etichetta = String(tipo ?? '').replace(/\s+/g, ' ').trim();
  if (!etichetta) return null;
  const key = etichetta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i diacritici
    .toUpperCase();
  return { key, etichetta };
}
