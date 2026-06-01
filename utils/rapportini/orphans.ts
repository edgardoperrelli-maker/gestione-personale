export function orphanRapportini(
  existing: { id: string; staff_id: string }[],
  currentStaffIds: string[],
): string[] {
  const current = new Set(currentStaffIds);
  return existing.filter((r) => !current.has(r.staff_id)).map((r) => r.id);
}
