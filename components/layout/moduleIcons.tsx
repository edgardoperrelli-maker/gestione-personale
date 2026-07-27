import type { ReactNode } from 'react';
import {
  Activity,
  BedDouble,
  Bot,
  CalendarClock,
  ChartColumn,
  ChartGantt,
  ClipboardCheck,
  Gauge,
  Headset,
  House,
  ListTodo,
  MapPinned,
  Settings,
  Siren,
  Sparkles,
  Table,
  Waves,
  Wrench,
} from 'lucide-react';
import type { AppModuleKey } from '@/lib/moduleAccess';

/**
 * Icone per modulo, riusate dalla Sidebar e dal launcher dell'hub.
 *
 * Dal 2026-07-23 il set viene da `lucide-react` (già dipendenza del progetto,
 * usata anche dai controlli mappa) invece che da SVG disegnate a mano: stesso
 * linguaggio a linee, tratto allineato a 1.6 come da DESIGN.md §7, metafore
 * mantenute da terzi. Le sostituzioni che cambiano significato rispetto al set
 * precedente:
 * - Interventi: lente → chiave inglese (la lente vuol dire «cerca» e collideva
 *   con la ricerca ⌘K in topbar);
 * - Live: «georadar» illeggibile a 20px → tracciato di attività (tempo reale);
 * - Cronoprogramma: caschetto da cantiere → barra Gantt (sequenza temporale);
 * - Appuntamenti: calendario+spunta → calendario+orologio, così la spunta resta
 *   solo a Consuntivazione e le due voci non si confondono di sguardo.
 */
const ICON_PROPS = { className: 'h-5 w-5', strokeWidth: 1.6 } as const;

export const MODULE_ICONS: Record<AppModuleKey, ReactNode> = {
  dashboard: <ChartGantt {...ICON_PROPS} />,
  'hotel-calendar': <BedDouble {...ICON_PROPS} />,
  mappa: <MapPinned {...ICON_PROPS} />,
  interventi: <Wrench {...ICON_PROPS} />,
  consuntivazione: <ClipboardCheck {...ICON_PROPS} />,
  'pronto-intervento': <Siren {...ICON_PROPS} />,
  assistenza: <Headset {...ICON_PROPS} />,
  live: <Activity {...ICON_PROPS} />,
  'lista-attesa': <ListTodo {...ICON_PROPS} />,
  appuntamenti: <CalendarClock {...ICON_PROPS} />,
  // `Waves` e non `Droplets`: AcquaLatina è l'altra commessa idrica e tiene la goccia. Due
  // committenti diversi con la stessa icona sarebbero indistinguibili nella sidebar.
  acea: <Waves {...ICON_PROPS} />,
  misuratori: <Gauge {...ICON_PROPS} />,
  agente: <Bot {...ICON_PROPS} />,
  performance: <ChartColumn {...ICON_PROPS} />,
  impostazioni: <Settings {...ICON_PROPS} />,
  'assegnazione-ai': <Sparkles {...ICON_PROPS} />,
};

/** Icona "Dashboard / Home" usata in cima alla sidebar. */
export const DASHBOARD_HOME_ICON: ReactNode = <House {...ICON_PROPS} />;

/**
 * Il modulo `mappa` espone due viste distinte (Pianificazione / Riepilogo
 * rapportini) che nella navigazione vivono come voci separate. La seconda ha
 * bisogno di un'icona propria, altrimenti in sidebar e in ⌘K compaiono due voci
 * diverse con lo stesso pin. Tabella = «stati per giorno e operatore».
 */
export const RIEPILOGO_RAPPORTINI_ICON: ReactNode = <Table {...ICON_PROPS} />;
