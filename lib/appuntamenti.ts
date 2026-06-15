/** Conta gli appuntamenti per ciascun giorno ISO (YYYY-MM-DD); i giorni senza restano a 0. */
export function countAppointmentsByDay(
  appointments: { data: string }[],
  isoDays: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const iso of isoDays) counts[iso] = 0;
  for (const a of appointments) {
    if (a.data in counts) counts[a.data] += 1;
  }
  return counts;
}
