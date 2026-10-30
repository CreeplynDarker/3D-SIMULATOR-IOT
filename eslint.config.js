import tseslint from 'typescript-eslint';

// AGENTS.md rule 4: the pure core imports no React, DOM, three.js or UI code.
const pureCoreImports = {
  patterns: [
    {
      group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'three', 'three/*', '@react-three/*', 'postprocessing'],
      message: 'Pure core (AGENTS.md rule 4): no React, DOM or three.js.',
    },
    { group: ['zustand', 'zustand/*', 'uplot'], message: 'Pure core (AGENTS.md rule 4): no store or chart code.' },
    {
      group: ['**/ui/**', '**/scene/**', '**/store/**', '**/bridge/**'],
      message: 'Pure core (AGENTS.md rule 4): never import UI, scene, store or bridge modules.',
    },
  ],
};

// AGENTS.md rule 3: time is sim time and randomness comes from shared/rng.ts.
const deterministicProperties = [
  { object: 'Math', property: 'random', message: 'Use shared/rng.ts with an explicit seed (AGENTS.md rule 3).' },
  { object: 'Date', property: 'now', message: 'Use sim time (AGENTS.md rule 3).' },
  { object: 'performance', property: 'now', message: 'Use sim time (AGENTS.md rule 3).' },
];
const browserGlobals = ['window', 'document', 'self', 'navigator', 'postMessage', 'onmessage', 'performance'].map(
  (name) => ({ name, message: 'Pure core (AGENTS.md rule 4): no DOM or worker globals.' }),
);
const timerGlobals = ['setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'queueMicrotask'].map(
  (name) => ({ name, message: 'No timers in the deterministic core (AGENTS.md rule 3).' }),
);

const coreFiles = [
  'src/shared/**/*.ts',
  'src/sim/**/*.ts',
  'src/firmware/**/*.ts',
  'src/rcf/**/*.ts',
  'src/harness/**/*.ts',
];
const workerFiles = ['src/sim/worker.ts', 'src/rcf/worker.ts'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'node_modules/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    files: coreFiles,
    ignores: workerFiles,
    rules: {
      'no-restricted-imports': ['error', pureCoreImports],
      'no-restricted-properties': ['error', ...deterministicProperties],
      'no-restricted-globals': ['error', ...browserGlobals, ...timerGlobals],
    },
  },
  // Workers are thin wrappers: they may use worker globals and wall-clock pacing, but still no UI imports.
  { files: workerFiles, rules: { 'no-restricted-imports': ['error', pureCoreImports] } },
  // The firmware logger and the UI console are the only places allowed to print.
  { files: ['src/firmware/logger.ts', 'src/ui/Console.tsx'], rules: { 'no-console': 'off' } },
);
