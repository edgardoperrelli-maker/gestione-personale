export type NavItem = {
  href: string;
  label: string;
  description?: string;
  section: 'overview' | 'modules' | 'system';
  matchPrefixes?: string[];
};

export const appNavigation: NavItem[] = [
  {
    href: '/hub',
    label: 'Hub',
    description: 'Accesso rapido ai moduli',
    section: 'overview',
    matchPrefixes: ['/hub'],
  },
  {
    href: '/dashboard',
    label: 'Cronoprogramma',
    description: 'Pianificazione turni e assegnazioni',
    section: 'overview',
    matchPrefixes: ['/dashboard'],
  },
  {
    href: '/hub/hotel-calendar',
    label: 'Calendario Hotel',
    description: 'Prenotazioni e occupazione',
    section: 'modules',
    matchPrefixes: ['/hub/hotel-calendar'],
  },
  {
    href: '/hub/smartracker',
    label: 'SmarTracker',
    description: 'Monitoraggio e tracciamento',
    section: 'modules',
    matchPrefixes: ['/hub/smartracker'],
  },
  {
    href: '/hub/rapportini',
    label: 'Rapportini',
    description: 'Massivi e per clientela',
    section: 'modules',
    matchPrefixes: ['/hub/rapportini'],
  },
  {
    href: '/hub/attrezzature',
    label: 'Attrezzature',
    description: 'Scadenziario e alert',
    section: 'modules',
    matchPrefixes: ['/hub/attrezzature'],
  },
  {
    href: '/hub/mappa',
    label: 'Mappa Operatori',
    description: 'Distribuzione territoriale',
    section: 'modules',
    matchPrefixes: ['/hub/mappa'],
  },
];

export const sectionLabels: Record<NavItem['section'], string> = {
  overview: 'Panoramica',
  modules: 'Moduli',
  system: 'Sistema',
};
