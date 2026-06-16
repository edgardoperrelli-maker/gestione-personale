// Probe di fattibilità — SOLA LETTURA.
// Verifica che Node giri sul PC e che la cartella SharePoint sincronizzata sia raggiungibile.
// NON installa nulla, NON scrive nulla, NON tocca i file Excel.
// Lancio:  node.exe probe.cjs
const fs = require('fs');
const path = require('path');

// >>> MODIFICA QUI con il percorso reale della cartella sincronizzata sul PC di lavoro <<<
const CARTELLA =
  'C:\\Users\\edgardo.perrelli\\Plenzich s.p.a\\Commesse - Documenti\\ANNO 2026\\CP 20260002_ACEA_GU IDRICHE L2\\8_LAVORI\\LIMITAZIONI MASSIVE';

console.log('=== PROBE LIMITAZIONI MASSIVE (sola lettura) ===');
console.log('Versione Node :', process.version);
console.log('Cartella      :', CARTELLA);

let ok = true;
try {
  const exists = fs.existsSync(CARTELLA);
  console.log('Raggiungibile :', exists ? 'SI ✅' : 'NO ❌');
  if (!exists) {
    ok = false;
  } else {
    const files = fs
      .readdirSync(CARTELLA)
      .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));
    console.log('File .xlsx    :', files.length);
    for (const f of files) {
      const st = fs.statSync(path.join(CARTELLA, f));
      console.log(
        '   - ' + f + '  (' + Math.round(st.size / 1024) + ' KB, modificato ' +
          st.mtime.toISOString().slice(0, 10) + ')',
      );
    }
  }
} catch (e) {
  ok = false;
  console.log('ERRORE        :', e.message);
}

console.log(ok ? '\nESITO: ambiente OK ✅ — possiamo procedere' : '\nESITO: da sistemare ❌ (vedi sopra)');
