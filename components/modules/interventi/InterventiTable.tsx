import { labelStato, badgeGeocode } from '@/lib/interventi/interventiView';

export type InterventoRow = {
  id: string;
  odl: string | null;
  indirizzo: string | null;
  comune: string | null;
  committente: string | null;
  stato: string | null;
  geocode_status: string | null;
  nominativo: string | null;
  fascia_oraria: string | null;
};

const TONE_STYLE: Record<'success' | 'danger' | 'muted', { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  muted: { bg: 'var(--brand-surface-muted)', fg: 'var(--brand-text-muted)' },
};

const TH = 'px-3 py-2 text-left font-semibold';
const TD = 'px-3 py-2';

export default function InterventiTable({ rows }: { rows: InterventoRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm"
        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
      >
        Nessun intervento per i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[28px] border" style={{ borderColor: 'var(--brand-border)' }}>
      <table className="min-w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--brand-text-muted)' }}>
            <th className={TH}>ODL</th>
            <th className={TH}>Indirizzo</th>
            <th className={TH}>Comune</th>
            <th className={TH}>Committente</th>
            <th className={TH}>Stato</th>
            <th className={TH}>Geocodifica</th>
            <th className={TH}>Nominativo</th>
            <th className={TH}>Fascia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const g = badgeGeocode(r.geocode_status);
            const tone = TONE_STYLE[g.tone];
            return (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                <td className={TD}>{r.odl ?? '—'}</td>
                <td className={TD}>{r.indirizzo ?? '—'}</td>
                <td className={TD}>{r.comune ?? '—'}</td>
                <td className={TD}>{r.committente ?? '—'}</td>
                <td className={TD}>{labelStato(r.stato)}</td>
                <td className={TD}>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: tone.bg, color: tone.fg }}
                  >
                    {g.label}
                  </span>
                </td>
                <td className={TD}>{r.nominativo ?? '—'}</td>
                <td className={TD}>{r.fascia_oraria ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
