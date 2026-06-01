export type OpLite = { id: string; displayName: string };

/** Normalizza in token: maiuscole, senza accenti, solo alfanumerici. */
function tokens(s: string): string[] {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Abbina un nome (es. "PASTORELLI") a un operatore: match se TUTTI i token del
 * nome sono presenti nei token del displayName. Nessun match o più match → null.
 */
export function matchEsecutore<T extends OpLite>(nome: string, operators: T[]): T | null {
  const needle = tokens(nome);
  if (needle.length === 0) return null;
  const matches = operators.filter((op) => {
    const hay = new Set(tokens(op.displayName));
    return needle.every((t) => hay.has(t));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Costruisce i pin task→operatore dai task che hanno `_operatore`. */
export function buildEsecutorePins<T extends OpLite>(
  tasks: { id: string; _operatore?: string }[],
  operators: T[],
): { pins: Record<string, string>; operatoriDaSelezionare: string[]; nonAbbinati: string[] } {
  const pins: Record<string, string> = {};
  const selezionati = new Set<string>();
  const nonAbbinati = new Set<string>();
  for (const t of tasks) {
    const nome = (t._operatore ?? '').trim();
    if (!nome) continue;
    const op = matchEsecutore(nome, operators);
    if (op) {
      pins[t.id] = op.id;
      selezionati.add(op.id);
    } else {
      nonAbbinati.add(nome.toUpperCase());
    }
  }
  return { pins, operatoriDaSelezionare: [...selezionati], nonAbbinati: [...nonAbbinati] };
}
