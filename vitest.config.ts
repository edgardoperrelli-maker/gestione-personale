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
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // `.claude/worktrees` contiene checkout git di sessioni passate: NON vanno raccolti,
    // altrimenti copie stale dei test inquinano la run (falsi rossi/verdi) e mascherano le regressioni.
    exclude: ['node_modules', '.next', '**/.claude/**'],
  },
});
