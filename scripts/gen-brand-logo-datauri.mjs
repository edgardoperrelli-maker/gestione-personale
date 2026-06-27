// Genera lib/og/brandLogo.ts incorporando public/brand/logo-plenzich.png come
// data URI base64: così l'immagine di anteprima (Open Graph) mostra il LOGO REALE,
// identico al file caricato, senza dipendere da fetch/filesystem a runtime.
//
// Rigenera dopo aver cambiato il logo:
//   node scripts/gen-brand-logo-datauri.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'public/brand/logo-plenzich.png';
const png = readFileSync(SRC);
const { width, height } = await sharp(png).metadata();
const b64 = png.toString('base64');

const ts = `// AUTO-GENERATO da ${SRC} — non modificare a mano.
// Rigenera con:  node scripts/gen-brand-logo-datauri.mjs
export const BRAND_LOGO_DATA_URI = 'data:image/png;base64,${b64}';
export const BRAND_LOGO_W = ${width};
export const BRAND_LOGO_H = ${height};
`;
writeFileSync('lib/og/brandLogo.ts', ts);
console.log(`lib/og/brandLogo.ts scritto — logo ${width}x${height}, base64 ${(b64.length / 1024).toFixed(1)}KB`);
