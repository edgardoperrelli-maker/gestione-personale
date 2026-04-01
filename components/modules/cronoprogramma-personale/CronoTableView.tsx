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
      <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 text-sm text-[var(--brand-text-muted)] shadow-sm">
        Nessuna assegnazione nel range selezionato.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white shadow-sm">
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
                      className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row.assignment)}
                      className="rounded-md border px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
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
