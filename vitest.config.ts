import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
  },
});
