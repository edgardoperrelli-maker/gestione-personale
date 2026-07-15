import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Mock 'server-only' so vitest (node env) non la rifiuta
      'server-only': fileURLToPath(new URL('./vitest.server-only-mock.js', import.meta.url)),
    },
  },
  esbuild: {
    // Abilita il runtime automatico JSX (React 17+) per i file .tsx importati nei test
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // `.claude/worktrees` contiene checkout git di sessioni passate: NON vanno raccolti,
    // altrimenti copie stale dei test inquinano la run (falsi rossi/verdi) e mascherano le regressioni.
    exclude: ['node_modules', '.next', '**/.claude/**'],
    env: {
      // Isola i test dei writer lim-sync dallo stato REALE tools/limitazioni-sync/.sync-watch.json
      // (baseline clobber SharePoint): senza questa env i test lo inquinavano con path fixture e
      // una race tra worker ne azzerava le chiavi vere. Dir temp unica per run di vitest.
      LIMSYNC_WATCH_STATE: join(mkdtempSync(join(tmpdir(), 'limsync-watch-test-')), '.sync-watch.json'),
    },
  },
});
