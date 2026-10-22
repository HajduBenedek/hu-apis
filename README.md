# hu-apis

Typed TypeScript clients and an MCP server for Hungarian public APIs: the pieces npm was missing.

| Package                          | What it wraps                                                   | Status                     |
| -------------------------------- | --------------------------------------------------------------- | -------------------------- |
| [`@hu-apis/ksh`](packages/ksh)   | KSH (Central Statistical Office) High-Value Datasets API        | working, unreleased        |
| [`@hu-apis/mnb`](packages/mnb)   | MNB (National Bank) official HUF exchange rates (SOAP)          | working, unreleased        |
| [`@hu-apis/mcp`](packages/mcp)   | MCP server exposing MNB + KSH to AI agents                      | working, unreleased        |
| [`@hu-apis/nav`](packages/nav)   | NAV Online Számla v3 (e-invoicing)                              | auth helpers only, private |
| [`@hu-apis/core`](packages/core) | Shared HTTP client: timeouts, retries with jitter, typed errors | internal                   |

Why these and not szamlazz.hu or Billingo? Those already have well-maintained clients.
See [ADR 0002](docs/adr/0002-package-scope.md) for the npm survey behind the scope.

## Quick look

```ts
import { createMnbClient } from '@hu-apis/mnb';
import { createKshClient } from '@hu-apis/ksh';

const mnb = createMnbClient();
const today = await mnb.getCurrentExchangeRates();
// { date: '2026-10-21', rates: [{ currency: 'EUR', unit: 1, rate: 365.28, hufPerUnit: 365.28 }, ...] }

const ksh = createKshClient();
const [population] = await ksh.searchDatasets('nepesseg'); // accent-insensitive
const { distributions } = await ksh.getDataset(population.id); // CSV download URLs + SDMX schemas
```

### MCP server

```json
{
  "mcpServers": {
    "hu-apis": { "command": "npx", "args": ["-y", "@hu-apis/mcp"] }
  }
}
```

Tools: `mnb_current_exchange_rates`, `mnb_exchange_rate_history`, `ksh_search_datasets`,
`ksh_get_dataset`. All are read-only; invalid input comes back as a tool error the model
can correct, not a crash.

## Upstream quirks this library handles

These were found while recording the test fixtures (2026-10-22):
- **MNB only answers over plain HTTP.** `https://www.mnb.hu/arfolyamok.asmx` returns 404 for
  SOAP calls, so the default endpoint is `http://`. Rates are public data, but you can point
  `endpoint` at your own HTTPS proxy.
- **MNB silently returns nothing** for an inverted date range or an unknown currency. The
  client validates dates (including impossible days like `2026-02-30`) and ISO codes before
  calling.
- **MNB returns input errors as SOAP faults with HTTP 500.** These surface as `MnbSoapFault`
  and are never retried, unlike real 5xx errors.
- **MNB's payload is XML escaped inside XML** and uses decimal commas (`365,28000`), with
  per-currency units (100 JPY).
- **KSH's OpenAPI spec says `tags`, the live API sends `keywords`.** Both are accepted.
- **KSH blocks browser calls via CORS**, so these clients are meant for servers, CLIs and agents.

## Engineering notes

- `pnpm test` runs offline against verbatim recorded responses.
- `pnpm test:live` runs contract tests against the real services; CI runs them every weekday
  morning ([contract.yml](.github/workflows/contract.yml)) so upstream changes are caught early.
- Retries: network errors, timeouts, 408/425/429 and 5xx, with full-jitter exponential backoff.
  Callers can veto per request (used for SOAP faults) and cancel with an `AbortSignal`.
- Decisions are recorded in [docs/adr](docs/adr).

## Development

Requires Node >= 22.18 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm test        # unit tests, offline
pnpm lint        # Biome
pnpm typecheck
pnpm build
```

## Roadmap

- [ ] `@hu-apis/nav`: verify signatures against NAV's official samples, then `queryTaxpayer`,
  `queryInvoiceDigest`, `queryInvoiceData` against the NAV test environment
- [ ] `@hu-apis/ksh`: stream and parse CSV distributions into typed rows
- [ ] MCP: `nav_query_taxpayer` (validate a Hungarian tax number)
- [ ] First npm release via Changesets

## License

MIT © Hajdu Benedek
