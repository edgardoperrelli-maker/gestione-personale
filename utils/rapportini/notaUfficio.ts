/**
 * Estrae la nota dell'ufficio dal raw_json di una voce. La nota viaggia come `raw_json.note`
 * (proveniente da `Task.note`). Ritorna undefined se assente, non stringa o stringa vuota.
 */
export function notaUfficioFromRaw(raw: unknown): string | undefined {
  const n = (raw as { note?: unknown } | null)?.note;
  return typeof n === 'string' && n.trim() !== '' ? n : undefined;
}
