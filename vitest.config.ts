import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

// Tests import sibling packages from source, so `vitest` works without a build step.
const alias = {
  '@hu-apis/core': src('core'),
  '@hu-apis/mnb': src('mnb'),
  '@hu-apis/ksh': src('ksh'),
  '@hu-apis/nav': src('nav'),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['**/*.live.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'live',
          include: ['packages/*/test/**/*.live.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
    },
  },
});
