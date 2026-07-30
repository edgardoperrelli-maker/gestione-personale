// La larghezza passata dal chiamante a <Select> non veniva MAI disegnata: ogni Select con
// `className="w-36"` restava a tutta riga. Non era un problema di specificità né di ordine
// nell'attributo `class` — in Tailwind v4, fra due utility dello stesso gruppo vince quella emessa
// più tardi nel foglio di stile, e `.w-full` è emessa dopo `.w-36`/`.w-44`/`.w-52`. La barra filtri
// ACEA (sei tendine su una riga) collassava così in sei tendine impilate a piena larghezza.
//
// La correzione fa passare le classi da `cn` (tailwind-merge), che risolve il conflitto a monte
// TOGLIENDO `w-full` dalla stringa. Questi test pinnano quel comportamento: verificano l'assenza di
// `w-full`, non la sola presenza della larghezza richiesta — la presenza c'era anche prima del fix,
// ed è esattamente il motivo per cui il bug è passato inosservato fino alla pagina in produzione.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Select from './Select';

const classi = (jsx: React.ReactElement): string[] => {
  const markup = renderToStaticMarkup(jsx);
  const attr = /class="([^"]*)"/.exec(markup)?.[1] ?? '';
  return attr.split(/\s+/).filter(Boolean);
};

describe('Select', () => {
  it('a tutta riga quando il chiamante non chiede una larghezza', () => {
    expect(classi(<Select />)).toContain('w-full');
  });

  it.each(['w-36', 'w-44', 'w-52'])('la larghezza %s del chiamante sostituisce w-full', (w) => {
    const c = classi(<Select className={`h-9 ${w}`} />);
    expect(c).toContain(w);
    expect(c).not.toContain('w-full');
  });

  it('conserva le classi di gruppi diversi dalla larghezza', () => {
    const c = classi(<Select className="h-9 w-44" />);
    expect(c).toContain('h-9');
    // Nessun conflitto con `h-9`: il padding verticale di base deve restare.
    expect(c).toContain('py-2');
  });

  it('lo stato di errore cambia il bordo e marca aria-invalid', () => {
    const markup = renderToStaticMarkup(<Select error />);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('border-[var(--danger)]');
    expect(markup).not.toContain('border-[var(--brand-border)]');
  });

  it('senza errore non espone aria-invalid', () => {
    expect(renderToStaticMarkup(<Select />)).not.toContain('aria-invalid');
  });

  // `CampoInput` dei rapportini passa `text-base` per il tocco sul portale operatore. Prima del fix
  // funzionava, ma per fortuna e non per costruzione: `text-base` vinceva solo perché Tailwind emette
  // le dimensioni in ordine di scala, quindi dopo `text-sm`. La stessa fortuna che sulle larghezze
  // non c'era. Ora la precedenza è decisa dal merge, non dall'ordine di emissione.
  it('la dimensione del testo del chiamante sostituisce quella di base', () => {
    const c = classi(<Select className="text-base" />);
    expect(c).toContain('text-base');
    expect(c).not.toContain('text-sm');
  });
});
