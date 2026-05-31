const x = (v: unknown) => (v === true ? 'X' : '');
export function risposteToStandardRow(risposte: Record<string, unknown>) {
  return {
    att_cess: x(risposte.att_cess), cambio: x(risposte.cambio), mini_bag: x(risposte.mini_bag),
    rg_stop: x(risposte.rg_stop), assente: x(risposte.assente),
    note: typeof risposte.note === 'string' ? risposte.note : '',
  };
}
