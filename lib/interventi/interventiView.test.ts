import { describe, it, expect } from 'vitest';
import { parseInterventiFilters, labelStato, badgeGeocode } from './interventiView';

describe('parseInterventiFilters', () => {
  it('usa i default (oggi + tutti) con param vuoti', () => {
    expect(parseInterventiFilters({}, '2026-06-02')).toEqual({
      data: '2026-06-02', committente: 'tutti', stato: 'tutti', geocode: 'tutti',
    });
  });
  it('accetta valori validi', () => {
    expect(
      parseInterventiFilters({ data: '2026-05-01', committente: 'acea', stato: 'assegnato', geocode: 'failed' }, '2026-06-02'),
    ).toEqual({ data: '2026-05-01', committente: 'acea', stato: 'assegnato', geocode: 'failed' });
  });
  it('ricade su tutti per valori non riconosciuti e su oggi per data malformata', () => {
    expect(
      parseInterventiFilters({ data: '01-05-2026', committente: 'pippo', stato: 'x', geocode: 'y' }, '2026-06-02'),
    ).toEqual({ data: '2026-06-02', committente: 'tutti', stato: 'tutti', geocode: 'tutti' });
  });
});

describe('labelStato', () => {
  it('mappa gli stati noti', () => {
    expect(labelStato('da_assegnare')).toBe('Da assegnare');
    expect(labelStato('in_esecuzione')).toBe('In esecuzione');
  });
  it('gestisce null e sconosciuti', () => {
    expect(labelStato(null)).toBe('—');
    expect(labelStato('boh')).toBe('boh');
  });
});

describe('badgeGeocode', () => {
  it('ok → success', () => {
    expect(badgeGeocode('ok')).toEqual({ label: 'Geocodificato', tone: 'success' });
  });
  it('failed → danger', () => {
    expect(badgeGeocode('failed')).toEqual({ label: 'Da correggere', tone: 'danger' });
  });
  it('pending/null → muted', () => {
    expect(badgeGeocode('pending')).toEqual({ label: 'In attesa', tone: 'muted' });
    expect(badgeGeocode(null)).toEqual({ label: 'In attesa', tone: 'muted' });
  });
});
