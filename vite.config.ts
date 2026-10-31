import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/scenario/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sim/**/*.ts', 'src/firmware/**/*.ts', 'src/rcf/**/*.ts', 'src/harness/**/*.ts'],
      exclude: ['src/**/worker.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // AGENTS.md: each pure-core folder keeps its own 80%, not just the average
        'src/sim/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/firmware/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/rcf/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/harness/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
