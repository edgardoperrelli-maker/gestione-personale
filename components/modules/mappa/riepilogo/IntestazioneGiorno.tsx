'use client';
import type { ReactNode } from 'react';
import Badge from '@/components/Badge';
import type { GiornoTerritori } from '@/utils/rapportini/groupByDayTerritory';
import { etichettaRelativaGiorno } from '@/utils/rapportini/giorniRiepilogo';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  // Sentence-case: solo l'iniziale (il giorno della settimana) va maiuscola,
  // il mese resta minuscolo — il CSS `capitalize` invece maiuscolava anche «Luglio».
  const s = d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const BADGE: Record<'oggi' | 'domani' | 'ieri', { label: string; variant: 'progress' | 'muted' }> = {
  oggi: { label: 'Oggi', variant: 'progress' },
  domani: { label: 'Domani', variant: 'muted' },
  ieri: { label: 'Ieri', variant: 'muted' },
};

/**
 * Banda di giorno: è l'intestazione d'inventario del Riepilogo — data, poi i
 * conti di quel giorno in mono tabulare, così le righe di giorni diversi si
 * leggono in colonna.
 */
export default function IntestazioneGiorno({ giorno, oggi, titoloId }: { giorno: GiornoTerritori; oggi: string; titoloId?: string }) {
  const rel = etichettaRelativaGiorno(giorno.data, oggi);
  const nPiani = giorno.territori.reduce((s, t) => s + t.piani.length, 0);
  const nOperatori = giorno.territori.reduce((s, t) => s + t.nOperatori, 0);
  const nInterventi = giorno.territori.reduce((s, t) => s + t.piani.reduce((x, p) => x + p.operatori.reduce((y, o) => y + (o.nVoci ?? 0), 0), 0), 0);
  const N = ({ children }: { children: ReactNode }) => <span className="font-mono tabular-nums">{children}</span>;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--brand-border)] pb-1.5">
      {rel && <Badge variant={BADGE[rel].variant}>{BADGE[rel].label}</Badge>}
      <h3 id={titoloId} className="text-base font-semibold text-[var(--brand-text-main)]">{fmtData(giorno.data)}</h3>
      <span className="text-xs text-[var(--brand-text-muted)]">
        <N>{nPiani}</N> piani · <N>{nOperatori}</N> operatori · <N>{nInterventi}</N> interventi
      </span>
    </div>
  );
}
