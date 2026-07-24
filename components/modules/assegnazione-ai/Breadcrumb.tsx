'use client';

// Adapter sul primitivo condiviso `@/components/ui/Breadcrumb` (DESIGN.md §7):
// la navigazione del modulo è già in URL (?commessa&attivita&azione), quindi ogni
// segmento diventa un link — cliccarlo risale nel drill-down. Prima era un
// breadcrumb reimplementato a mano con «← Indietro» e separatori «/» di testo.

import BreadcrumbBase, { type BreadcrumbItem } from '@/components/ui/Breadcrumb';
import { breadcrumbSegments, type NavState } from '@/lib/agente/aceaNav';

const BASE = '/hub/assegnazione-ai';

export function Breadcrumb({ nav }: { nav: NavState }) {
  const segs = breadcrumbSegments(nav);
  if (segs.length === 0) return null;

  const items: BreadcrumbItem[] = [{ label: 'Assegnazioni AI', href: BASE }];
  const qs = new URLSearchParams();
  segs.forEach((s, i) => {
    qs.set(s.level, s.key);
    const last = i === segs.length - 1;
    items.push({ label: s.label, href: last ? undefined : `${BASE}?${qs.toString()}` });
  });

  return <BreadcrumbBase items={items} />;
}
