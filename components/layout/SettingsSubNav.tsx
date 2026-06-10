'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/impostazioni/utenze',    label: 'Utenze', requiresAdminPlus: true },
  { href: '/impostazioni/personale', label: 'Personale' },
  { href: '/impostazioni/territori', label: 'Territori' },
  { href: '/impostazioni/gruppo-attivita', label: 'Attivita' },
  { href: '/impostazioni/hotel',     label: 'Hotel' },
  { href: '/impostazioni/zone-ztl',  label: 'Zone ZTL' },
];

export default function SettingsSubNav({ isAdminPlus = false }: { isAdminPlus?: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => !tab.requiresAdminPlus || isAdminPlus);
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--brand-border)] pb-4">
      {tabs.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)]'
                : 'text-[var(--brand-text-muted)] hover:bg-[var(--brand-primary-soft)] hover:text-[var(--brand-primary)]'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
