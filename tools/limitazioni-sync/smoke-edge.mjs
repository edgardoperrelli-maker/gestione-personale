// Smoke-test: verifica che Playwright sappia lanciare l'Edge installato (senza admin).
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
await p.goto('https://example.com');
console.log('OK - Edge headless funziona. Titolo:', await p.title());
await b.close();
