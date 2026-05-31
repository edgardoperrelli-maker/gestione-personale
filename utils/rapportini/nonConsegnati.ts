export function nonConsegnati<T extends { data: string; stato: string; staff_name?: string }>(
  rapportini: T[], todayIso: string,
): { staff_name?: string; data: string }[] {
  return rapportini
    .filter((r) => r.stato !== 'inviato' && r.data < todayIso)
    .map((r) => ({ staff_name: r.staff_name, data: r.data }));
}
