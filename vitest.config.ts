import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests live outside `nodes/` so the n8n community-package scanner, which lints every
    // source file under `nodes/` and `credentials/`, never sees them.
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
});
