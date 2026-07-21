export type { Task, OperatorBase, RouteResult, ScheduleEntry } from './types';
export { geocodeTask, geocodeBatch } from './geocoding';
export { optimizeRoute, optimizeRouteByFascia } from './optimizer';
export { parseExcelToTasks, isFileTemplateUfficiale } from './excelParser';
export { matchEsecutore, buildEsecutorePins } from './esecutore';
