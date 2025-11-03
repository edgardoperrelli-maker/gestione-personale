'use client';
import type { Assignment } from '@/types';

type Style = {
  cardBg:string; cardBd:string; text:string; band:string;
  badgeBg:string; badgeBd:string; badgeTx:string;
};

const STYLES: Record<string, Style> = {
  FIRENZE:      { cardBg:'bg-orange-50', cardBd:'border-orange-200', text:'text-orange-900', band:'bg-orange-200', badgeBg:'bg-orange-50', badgeBd:'border-orange-200', badgeTx:'text-orange-900' },
  AURELIA:      { cardBg:'bg-green-50',  cardBd:'border-green-200',  text:'text-green-900',  band:'bg-green-200',  badgeBg:'bg-green-50',  badgeBd:'border-green-200',  badgeTx:'text-green-900' },
  'LAZIO EST':  { cardBg:'bg-sky-50',    cardBd:'border-sky-200',    text:'text-sky-900',    band:'bg-sky-200',    badgeBg:'bg-sky-50',    badgeBd:'border-sky-200',    badgeTx:'text-sky-900' },
  PADOVA:       { cardBg:'bg-violet-50', cardBd:'border-violet-200', text:'text-violet-900', band:'bg-violet-200', badgeBg:'bg-violet-50', badgeBd:'border-violet-200', badgeTx:'text-violet-900' },
  PERUGIA:      { cardBg:'bg-rose-50',   cardBd:'border-rose-200',   text:'text-rose-900',   band:'bg-rose-200',   badgeBg:'bg-rose-50',   badgeBd:'border-rose-200',   badgeTx:'text-rose-900' },
  'LAZIO CENTRO': { cardBg:'bg-gray-100', cardBd:'border-gray-300',  text:'text-gray-900',   band:'bg-gray-300',   badgeBg:'bg-gray-100',  badgeBd:'border-gray-300',   badgeTx:'text-gray-900' },
  NAPOLI:       { cardBg:'bg-blue-50',   cardBd:'border-blue-200',   text:'text-blue-900',   band:'bg-blue-200',   badgeBg:'bg-blue-50',   badgeBd:'border-blue-200',   badgeTx:'text-blue-900' },
};

function norm(s?: string) {
  return (s ?? '').trim().toUpperCase();
}

export default function OperatorCard({
  a,
  onDelete,
  onEdit,
}: {
  a: Assignment;
  onDelete: () => void;
  onEdit: (assignment: Assignment) => void;
}) {
  const key = norm(a.territory?.name);
  const s = STYLES[key] ?? {
    cardBg:'bg-[var(--card-bg)]',
    cardBd:'border-[var(--card-bd)]',
    text:'text-slate-900',
    band:'bg-slate-300',
    badgeBg:'bg-slate-50',
    badgeBd:'border-[var(--card-bd)]',
    badgeTx:'text-slate-700',
  };

  const terr = a.territory?.name ?? '';
  const act  = a.activity?.name ?? '';

  return (
    <div
      className={`relative rounded-lg border ${s.cardBg} ${s.cardBd} px-2 py-1.5 text-[10px] leading-tight shadow ${s.text} hover:shadow-md transition`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${s.band}`} />

      {/* Riga 1: nome + REP + azioni */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-tight truncate">
            {a.staff?.display_name ?? '—'}
          </span>
          {a.reperibile && (
            <span
              className="shrink-0 inline-flex items-center px-1.5 py-px rounded border bg-red-100 border-red-300 text-red-800 font-bold"
              title="Operatore reperibile"
            >
              REP
            </span>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(a); }}
            className="px-1.5 py-0.5 rounded border bg-white/80 hover:bg-white text-[10px]"
            title="Modifica"
          >
            Modifica
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="px-1.5 py-0.5 rounded border bg-white/80 hover:bg-white text-[10px]"
            title="Elimina"
          >
            Elimina
          </button>
        </div>
      </div>

      {/* Riga 2: territorio + attività in linea */}
      <div className="mt-1 flex items-center gap-1 overflow-hidden">
        {terr && (
          <span className={`inline-flex items-center px-1.5 py-px rounded border ${s.badgeBg} ${s.badgeBd} ${s.badgeTx} whitespace-nowrap`}>
            {terr}
          </span>
        )}
        <span className="text-[10px] text-slate-700 truncate">
          {act || '—'}
        </span>
      </div>

      {/* Riga 3: note compattate su una riga */}
      {a.notes && (
        <div className="mt-0.5 text-[10px] text-slate-800 truncate">
          {a.notes}
        </div>
      )}
    </div>
  );
}
