'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { InterventiFilters as Filters } from '@/lib/interventi/interventiView';

const fieldStyle = {
  borderColor: 'var(--brand-border)',
  color: 'var(--brand-text-main)',
  backgroundColor: 'var(--brand-surface)',
};
const labelClass = 'block text-xs font-semibold uppercase tracking-[0.14em]';
const labelStyle = { color: 'var(--brand-text-muted)' };
const controlClass = 'w-full rounded-2xl border px-3 py-2 text-sm outline-none transition';

export default function InterventiFilters({ filters }: { filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSelect(key: string, value: string) {
    setParam(key, value === 'tutti' ? '' : value);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="space-y-1">
        <label htmlFor="f-data" className={labelClass} style={labelStyle}>Data</label>
        <input
          id="f-data"
          type="date"
          value={filters.data}
          onChange={(e) => setParam('data', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="f-committente" className={labelClass} style={labelStyle}>Committente</label>
        <select
          id="f-committente"
          value={filters.committente}
          onChange={(e) => onSelect('committente', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="acea">Acea</option>
          <option value="italgas">Italgas</option>
          <option value="altro">Altro</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="f-stato" className={labelClass} style={labelStyle}>Stato</label>
        <select
          id="f-stato"
          value={filters.stato}
          onChange={(e) => onSelect('stato', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="da_assegnare">Da assegnare</option>
          <option value="assegnato">Assegnato</option>
          <option value="in_viaggio">In viaggio</option>
          <option value="sul_posto">Sul posto</option>
          <option value="in_esecuzione">In esecuzione</option>
          <option value="completato">Completato</option>
          <option value="annullato">Annullato</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="f-geocode" className={labelClass} style={labelStyle}>Geocodifica</label>
        <select
          id="f-geocode"
          value={filters.geocode}
          onChange={(e) => onSelect('geocode', e.target.value)}
          className={controlClass}
          style={fieldStyle}
        >
          <option value="tutti">Tutti</option>
          <option value="ok">Geocodificati</option>
          <option value="failed">Da correggere</option>
          <option value="pending">In attesa</option>
        </select>
      </div>
    </div>
  );
}
