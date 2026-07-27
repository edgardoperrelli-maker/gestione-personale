'use client';

import { valoreCella, type DefColonna, type RigaTabella } from '@/lib/acea/colonneTabella';

/**
 * Esporta in xlsx **quello che si vede**: le righe filtrate e le colonne visibili, nell'ordine
 * corrente della tabella.
 *
 * È la contropartita dello spegnimento del master: quando serve una formula o una pivot ad hoc,
 * si esporta la vista invece di tenere in vita un file che si disallinea. `xlsx` è già una
 * dipendenza del progetto, e si carica dinamicamente perché serve solo al click.
 */
export async function esportaVista(
  righe: readonly RigaTabella[],
  colonne: readonly DefColonna[],
  nomeFile: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const intestazione = colonne.map((c) => c.intestazione);
  const corpo = righe.map((r) => colonne.map((c) => {
    const v = valoreCella(r, c.chiave);
    return v === '—' ? '' : v;
  }));

  const ws = XLSX.utils.aoa_to_sheet([intestazione, ...corpo]);
  ws['!cols'] = colonne.map((c) => ({ wch: Math.max(10, Math.round(c.larghezza / 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ACEA');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
