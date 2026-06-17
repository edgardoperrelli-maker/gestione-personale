// Colori coerenti per le viste Performance (barre confronto + donut attività).
export const MACRO_COLORS: Record<string, string> = {
  Limitazioni: '#06b6d4',
  'Morosità / forniture': '#f59e0b',
  Sospensioni: '#ef4444',
  Bonifiche: '#22c55e',
  Picarro: '#a855f7',
  'Flusso idrico': '#3b82f6',
  'Sostituzioni / sonde': '#ec4899',
  Altro: '#94a3b8',
  'Non specificato': '#64748b',
};
export function colorForMacro(name: string): string {
  return MACRO_COLORS[name] ?? '#94a3b8';
}

/** Palette generica posizionale per donut committente/territorio. */
export const PALETTE = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#3b82f6', '#ef4444', '#94a3b8'];
