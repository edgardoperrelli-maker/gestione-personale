export type CostCenterRange = {
  cost_center: string;
  valid_from: string;        // YYYY-MM-DD
  valid_to: string | null;   // YYYY-MM-DD oppure null (aperto)
};

/** Copertura inclusiva di una data da parte di un range. */
function covers(range: CostCenterRange, isoDate: string): boolean {
  if (range.valid_from > isoDate) return false;
  if (range.valid_to != null && isoDate > range.valid_to) return false;
  return true;
}

/**
 * Centro di costo attivo per una data: l'override di periodo che copre la data
 * (se più d'uno, vince il valid_from più recente; poi il valid_to più recente),
 * altrimenti il default dell'operatore.
 */
export function resolveCostCenter(
  defaultCostCenter: string | null,
  ranges: CostCenterRange[],
  isoDate: string
): string | null {
  const covering = ranges.filter((rg) => covers(rg, isoDate));
  if (covering.length === 0) return defaultCostCenter;
  covering.sort((a, b) => {
    if (a.valid_from !== b.valid_from) return a.valid_from < b.valid_from ? 1 : -1; // from più recente prima
    const at = a.valid_to ?? '9999-12-31';
    const bt = b.valid_to ?? '9999-12-31';
    return at < bt ? 1 : at > bt ? -1 : 0;
  });
  return covering[0].cost_center;
}
