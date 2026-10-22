# ADR 0001: Monorepo and tooling

- Status: accepted
- Date: 2026-10-22

## Context

hu-apis ships several small npm packages (one per upstream API) plus an MCP server that
depends on them. They share an HTTP layer, error types, lint rules and a release process.

## Decision

- **pnpm workspaces** with `workspace:^` ranges. No Turborepo/Nx: five packages build in
  seconds, and a task runner would be more configuration than it saves.
- **ESM only**, `target: node22`. Node 20 reached end of life in April 2026; Node 22+ can
  `require()` ESM, so CommonJS consumers are still served without a dual build.
- **tsup** for builds (bundled `.d.ts`), **Vitest** for tests, **Biome** for lint + format
  (one tool, one config, fast enough to run on every save).
- **Tests run against source**, not `dist`: `vitest.config.ts` aliases `@hu-apis/*` to
  `packages/*/src`, and the root `tsconfig.json` does the same with `paths`. Package
  `tsconfig.json` files have no paths, so builds resolve siblings through real package
  exports in topological order.
- **Recorded fixtures** for unit tests (verbatim upstream responses, marked `-text` in
  `.gitattributes`), plus separate **live contract tests** that run nightly in CI.
- **Changesets** for versioning and changelogs; npm publishes with provenance.

## Consequences

- `pnpm test` needs no build step and no network.
- Contributors need Node >= 22.18 for the dev tooling (`.nvmrc` pins 24); the published
  packages only require Node >= 22 at runtime.
