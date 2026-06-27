// Genera lib/og/brandLogo.ts incorporando i loghi come data URI base64: così
// l'immagine di anteprima (Open Graph) mostra i LOGHI REALI, identici ai file,
// senza dipendere da fetch/filesystem a runtime.
//
// Rigenera dopo aver cambiato un logo:
//   node scripts/gen-brand-logo-datauri.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

async function asset(path) {
  const buf = readFileSync(path);
  const { width, height } = await sharp(buf).metadata();
  return { uri: `data:image/png;base64,${buf.toString('base64')}`, width, height };
}

const plenzich = await asset('public/brand/logo-plenzich.png');
const gestilab = await asset('public/brand/gestilab-g.png');

const ts = `// AUTO-GENERATO da public/brand/*.png — non modificare a mano.
// Rigenera con:  node scripts/gen-brand-logo-datauri.mjs
export const BRAND_LOGO_DATA_URI = '${plenzich.uri}';
export const BRAND_LOGO_W = ${plenzich.width};
export const BRAND_LOGO_H = ${plenzich.height};
export const GESTILAB_G_DATA_URI = '${gestilab.uri}';
export const GESTILAB_G_W = ${gestilab.width};
export const GESTILAB_G_H = ${gestilab.height};
`;
writeFileSync('lib/og/brandLogo.ts', ts);
console.log(
  `lib/og/brandLogo.ts scritto — Plenzich ${plenzich.width}x${plenzich.height}, ` +
    `Gestilab G ${gestilab.width}x${gestilab.height}`,
);
