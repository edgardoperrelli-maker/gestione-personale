import { describe, it, expect } from 'vitest';
import { euroIt, numeroIt } from './numero-it';

// Lo spazio prima di € è un NBSP (\u00a0): lo mette ICU, ed è quello che la pagina già rende.
describe('numeroIt / euroIt — il punto delle migliaia c’è sempre', () => {
  it('raggruppa anche i numeri a QUATTRO cifre (il caso che ICU italiano non raggruppa)', () => {
    // È il bug visto in pagina: «141.453,71 €» accanto a «6115,73 €», stessa funzione.
    expect(euroIt(6115.73)).toBe('6.115,73\u00a0€');
    expect(numeroIt(3366)).toBe('3.366');
    expect(numeroIt(1142.11)).toBe('1.142,11');
  });

  it('lascia intatti i numeri grandi, che già si raggruppavano', () => {
    expect(euroIt(141453.71)).toBe('141.453,71\u00a0€');
    expect(numeroIt(1234567)).toBe('1.234.567');
  });

  it('sotto il migliaio non inventa separatori', () => {
    expect(euroIt(150.08)).toBe('150,08\u00a0€');
    expect(numeroIt(0)).toBe('0');
  });

  it('gli euro hanno due decimali per default, azzerabili per gli arrotondati', () => {
    expect(euroIt(1000)).toBe('1.000,00\u00a0€');
    expect(euroIt(91.12, 0)).toBe('91\u00a0€');
  });

  it('i negativi tengono il segno davanti', () => {
    expect(euroIt(-2500.5)).toBe('-2.500,50\u00a0€');
  });

  it('`decimali` su numeroIt fissa le cifre, altrimenti si adatta', () => {
    expect(numeroIt(123.4, 2)).toBe('123,40');
    expect(numeroIt(123.456)).toBe('123,456');
  });
});
