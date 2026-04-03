'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/impostazioni/utenze',    label: 'Utenze' },
  { href: '/impostazioni/zone-ztl',  label: 'Zone ZTL' },
];

export default function SettingsSubNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-2 border-b border-[var(--brand-border)] pb-4">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-[var(--brand-primary)] text-white'
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
