import { defineConfig, type Options } from 'tsup';

/** Build settings shared by every package; each package's tsup.config.ts only adds entries. */
export const sharedConfig = (overrides: Options = {}) =>
  defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node22',
    ...overrides,
  });
