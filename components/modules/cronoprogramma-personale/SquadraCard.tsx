'use client';

import { type DragEvent } from 'react';
import type { Assignment } from '@/types';
import { getTerritoryStyle } from '@/lib/territoryColors';
import { membriPresenti, type SquadraGroup } from './squadre';

/**
 * Card-squadra del cronoprogramma: N membri (stesso squadra_id) resi come un'unica card con una
 * "catena" verticale che li lega. Il colore resta quello del territorio; il blu marca il legame di
 * squadra. Ogni membro è draggabile (trascinarlo fuori lo sgancia). La card è drop-target: trascinare
 * una card singola sopra la squadra aggiunge un membro.
 */
export default function SquadraCard({
  group,
  iso,
  absentIds,
  taskCountMap,
  onSciogli,
  onRimuoviMembro,
  onSetCapo,
  onEditMembro,
  onDropSingolo,
  onDragStartMembro,
}: {
  group: SquadraGroup;
  iso: string;
  absentIds: Set<string>;
  taskCountMap?: Record<string, number>;
  onSciogli: (squadraId: string) => void;
  onRimuoviMembro: (squadraId: string, membroId: string) => void;
  onSetCapo: (squadraId: string, membroId: string) => void;
  onEditMembro: (a: Assignment) => void;
  onDropSingolo: (target: Assignment, e: DragEvent<HTMLDivElement>) => void;
  onDragStartMembro: (e: DragEvent<HTMLDivElement>, a: Assignment) => void;
}) {
  const first = group.membri[0];
  const s = getTerritoryStyle(first?.territory?.name);
  const { presenti, totale } = membriPresenti(group.membri, absentIds);
  const sotto = group.target != null && presenti < group.target;
  const incompleta = presenti < totale;
  const terr = first?.territory?.name ?? '';
  const act = first?.activity?.name ?? '';
  const cc = first?.cost_center ?? '';

  return (
    <div
      className="group relative rounded-lg border px-2 pb-2 pt-1.5 text-[11px] leading-snug shadow-sm transition"
      style={{ backgroundColor: s.bg, borderColor: s.border, color: s.text, outline: '1px solid var(--brand-primary-border)' }}
      title="Squadra — trascina una card qui per aggiungere un membro"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'link';
      }}
      onDrop={(e) => {
        // Aggiungi il membro trascinato alla squadra (target = un membro qualsiasi → stesso squadra_id).
        e.stopPropagation();
        if (first) onDropSingolo(first, e);
      }}
    >
      <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ backgroundColor: s.band }} />

      <div className="flex items-center justify-between gap-2 pl-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: 'var(--brand-primary-soft)', borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary-border)' }}
        >
          ⛓ Squadra ×{totale}
        </span>
        <div className="flex items-center gap-1">
          {group.target != null && (
            <span
              className="rounded-full px-1.5 py-px text-[9px] font-semibold"
              style={
                sotto
                  ? { color: 'var(--warning)', border: '1px solid var(--warning)' }
                  : { color: s.text, border: `1px solid ${s.border}` }
              }
              title={sotto ? 'Squadra sotto organico' : 'Organico consigliato'}
            >
              {presenti}/{group.target}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSciogli(group.squadraId);
            }}
            className="rounded border border-white/20 bg-black/20 px-1.5 py-px text-[9px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--danger)' }}
            title="Sciogli la squadra"
          >
            Sciogli ✕
          </button>
        </div>
      </div>

      <div className="relative mt-1 pl-4">
        <span className="absolute bottom-1.5 left-1.5 top-1.5 w-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', opacity: 0.85 }} />
        {group.membri.map((m) => {
          const assente = absentIds.has(m.staff?.id ?? '');
          const capo = group.capo?.id === m.id;
          const count = taskCountMap?.[`${m.staff?.id}|${iso}`];
          return (
            <div
              key={m.id}
              draggable
              onDragStart={(e) => onDragStartMembro(e, m)}
              className="group/m relative flex cursor-grab items-center gap-1.5 py-0.5 active:cursor-grabbing"
            >
              <span className="absolute -left-[11px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', boxShadow: `0 0 0 2px ${s.bg}` }} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetCapo(group.squadraId, m.id);
                }}
                className="shrink-0 text-[10px] leading-none transition"
                style={{ color: capo ? 'var(--brand-primary)' : 'var(--brand-text-muted)', opacity: capo ? 1 : 0.5 }}
                title={capo ? 'Capo squadra' : 'Imposta come capo'}
              >
                {capo ? '★' : '☆'}
              </button>
              {m.reperibile && (
                <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none" style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  REP
                </span>
              )}
              <span
                className={`min-w-0 flex-1 truncate font-semibold uppercase tracking-tight ${assente ? 'line-through opacity-50' : ''}`}
                title={m.staff?.display_name ?? '-'}
              >
                {`${m.staff?.display_name ?? '-'}${count != null && count > 0 ? ` (${count})` : ''}`}
              </span>
              {assente && (
                <span className="shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }}>
                  assente
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/m:opacity-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditMembro(m);
                  }}
                  className="rounded border border-white/20 bg-black/20 px-1.5 py-px text-[9px] font-medium"
                  title="Modifica"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRimuoviMembro(group.squadraId, m.id);
                  }}
                  className="rounded border border-white/20 bg-black/20 px-1.5 py-px text-[9px] font-medium"
                  style={{ color: 'var(--danger)' }}
                  title="Togli dalla squadra"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(terr || act || cc) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0 pl-1.5 text-[10px] opacity-75">
          {terr && <span className="font-medium">{terr}</span>}
          {terr && act && <span className="opacity-50">|</span>}
          {act && <span className="max-w-[90px] truncate">{act}</span>}
          {cc && <span className="opacity-50">|</span>}
          {cc && <span className="opacity-70">{cc}</span>}
        </div>
      )}

      {incompleta && (
        <div className="mx-1.5 mt-1 rounded-md px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }}>
          Squadra incompleta — {presenti}/{totale} presenti
        </div>
      )}
    </div>
  );
}
