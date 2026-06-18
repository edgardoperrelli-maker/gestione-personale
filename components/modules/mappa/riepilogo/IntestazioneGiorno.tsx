'use client';
import type { GiornoPiani } from '@/utils/rapportini/groupByDayPiano';
import { etichettaRelativaGiorno } from '@/utils/rapportini/giorniRiepilogo';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

const BADGE: Record<'oggi' | 'domani' | 'ieri', { label: string; cls: string }> = {
  oggi: { label: 'Oggi', cls: 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' },
  domani: { label: 'Domani', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
  ieri: { label: 'Ieri', cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]' },
};

export default function IntestazioneGiorno({ giorno, oggi }: { giorno: GiornoPiani; oggi: string }) {
  const rel = etichettaRelativaGiorno(giorno.data, oggi);
  const nPiani = giorno.piani.length;
  const nOperatori = giorno.piani.reduce((s, p) => s + p.operatori.length, 0);
  const nInterventi = giorno.piani.reduce((s, p) => s + p.operatori.reduce((x, o) => x + (o.nVoci ?? 0), 0), 0);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {rel && (
        <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${BADGE[rel].cls}`}>{BADGE[rel].label}</span>
      )}
      <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(giorno.data)}</h3>
      <span className="text-xs text-[var(--brand-text-muted)]">· {nPiani} piani · {nOperatori} operatori · {nInterventi} interventi</span>
    </div>
  );
}
