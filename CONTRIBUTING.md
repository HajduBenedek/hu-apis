# Contributing

1. `pnpm install` (Node >= 22.18, pnpm 10)
2. Make your change with tests. Unit tests must not hit the network: record the real response
   into `packages/<pkg>/test/fixtures/` and note the date in the test file.
3. `pnpm lint && pnpm typecheck && pnpm test`
4. `pnpm changeset` to describe the change for the changelog.

Found an upstream quirk? Add it to the "Upstream quirks" list in the README with a test.
