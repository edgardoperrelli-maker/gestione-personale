'use client';
import type { Assignment } from '@/types';

type Style = {
  cardBg:string; cardBd:string; text:string; band:string;
  badgeBg:string; badgeBd:string; badgeTx:string;
};

const STYLES: Record<string, Style> = {
  FIRENZE:      { cardBg:'bg-orange-100', cardBd:'border-orange-300', text:'text-orange-900', band:'bg-orange-300', badgeBg:'bg-orange-100', badgeBd:'border-orange-300', badgeTx:'text-orange-900' },
  AURELIA:      { cardBg:'bg-green-100',  cardBd:'border-green-300',  text:'text-green-900',  band:'bg-green-300',  badgeBg:'bg-green-100',  badgeBd:'border-green-300',  badgeTx:'text-green-900' },
  'LAZIO EST':  { cardBg:'bg-sky-100',    cardBd:'border-sky-300',    text:'text-sky-900',    band:'bg-sky-300',    badgeBg:'bg-sky-100',    badgeBd:'border-sky-300',    badgeTx:'text-sky-900' },
  PADOVA:       { cardBg:'bg-violet-100', cardBd:'border-violet-300', text:'text-violet-900', band:'bg-violet-300', badgeBg:'bg-violet-100', badgeBd:'border-violet-300', badgeTx:'text-violet-900' },
  PERUGIA:      { cardBg:'bg-rose-100',   cardBd:'border-rose-300',   text:'text-rose-900',   band:'bg-rose-300',   badgeBg:'bg-rose-100',   badgeBd:'border-rose-300',   badgeTx:'text-rose-900' },
  // più evidente
  'LAZIO CENTRO': { cardBg:'bg-gray-200', cardBd:'border-gray-400',   text:'text-gray-900',   band:'bg-gray-400',   badgeBg:'bg-gray-200',   badgeBd:'border-gray-400',   badgeTx:'text-gray-900' },
  // nuovo territorio
  NAPOLI:       { cardBg:'bg-blue-100',   cardBd:'border-blue-300',   text:'text-blue-900',   band:'bg-blue-300',   badgeBg:'bg-blue-100',   badgeBd:'border-blue-300',   badgeTx:'text-blue-900' },
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

  return (
    <div className={`relative rounded-xl border ${s.cardBg} ${s.cardBd} px-3 py-2 text-[11px] shadow ${s.text} hover:shadow-md transition`}>
      <div className={`absolute left-0 top-0 h-full w-1.5 rounded-l-xl ${s.band}`} />

      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold min-w-0">
          <span className="block truncate">{a.staff?.display_name ?? '—'}</span>
        </div>
        {a.reperibile && (
          <span
            className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border bg-red-100 border-red-400 text-red-900 font-bold uppercase tracking-wide"
            title="Operatore reperibile"
          >
            Reperibile
          </span>
        )}
      </div>

      <div className="mt-1 flex gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap gap-1">
            {a.territory && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border ${s.badgeBg} ${s.badgeBd} ${s.badgeTx}`}>
                {a.territory.name}
              </span>
            )}
          </div>

          <div>
            {a.activity ? (
              <span className="inline-flex px-2 py-0.5 rounded-md border bg-white/70 border-black/10 text-slate-900">
                {a.activity.name}
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded-md border bg-white/70 border-black/10 text-gray-700">
                Nessuna attività
              </span>
            )}
          </div>

          {a.notes && (
            <div className="text-[11px] text-slate-800 whitespace-pre-wrap break-words">
              {a.notes}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(a); }}
            className="px-2 py-0.5 rounded-md border bg-white/80 hover:bg-white text-xs"
            title="Modifica assegnazione"
          >
            Modifica
          </button>
          <button

  onClick={(e) => { e.stopPropagation(); onDelete(); }}
  className="px-2 py-0.5 rounded-md border bg-white/80 hover:bg-white text-xs"
  title="Elimina assegnazione"
>
  Elimina
</button>

        </div>
      </div>
    </div>
  );
}
