import { APP_MODULES } from '@/lib/moduleAccess';

export type NavItem = {
  key: string;
  href: string;
  label: string;
  description?: string;
  section: 'overview' | 'modules' | 'system';
  matchPrefixes?: string[];
};

export const appNavigation: NavItem[] = [
  {
    key: 'hub',
    href: '/hub',
    label: 'Hub',
    description: 'Accesso rapido ai moduli',
    section: 'overview',
    matchPrefixes: ['/hub'],
  },
  ...APP_MODULES.map((module) => ({
    key: module.key,
    href: module.href,
    label: module.label,
    description: module.description,
    section: module.section,
    matchPrefixes: module.matchPrefixes,
  })),
];

export const sectionLabels: Record<NavItem['section'], string> = {
  overview: 'Panoramica',
  modules: 'Moduli',
  system: 'Sistema',
};
