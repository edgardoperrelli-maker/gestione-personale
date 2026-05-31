'use client';

import type { Assignment } from '@/types';

export type TableRow = {
  day: string;
  assignment: Assignment;
};

export default function CronoTableView({
  rows,
  onEdit,
  onDelete,
}: {
  rows: TableRow[];
  onEdit: (a: Assignment) => void;
  onDelete: (a: Assignment) => void;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 text-sm text-[var(--brand-text-muted)] shadow-sm">
        Nessuna assegnazione nel range selezionato.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--brand-primary-soft)]/50 text-left text-xs uppercase text-[var(--brand-text-muted)]">
            <tr>
              <th className="px-4 py-3">Giorno</th>
              <th className="px-4 py-3">Operatore</th>
              <th className="px-4 py-3">Territorio</th>
              <th className="px-4 py-3">Attivita</th>
              <th className="px-4 py-3">CdC</th>
              <th className="px-4 py-3">Reperibile</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.assignment.id} className="border-t border-[var(--brand-border)]">
                <td className="px-4 py-3">{row.day}</td>
                <td className="px-4 py-3 font-medium">{row.assignment.staff?.display_name ?? '-'}</td>
                <td className="px-4 py-3">{row.assignment.territory?.name ?? '-'}</td>
                <td className="px-4 py-3">{row.assignment.activity?.name ?? '-'}</td>
                <td className="px-4 py-3">{row.assignment.cost_center ?? '-'}</td>
                <td className="px-4 py-3">{row.assignment.reperibile ? 'Si' : 'No'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(row.assignment)}
                      className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.assignment)}
                      className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    >
                      Elimina
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
