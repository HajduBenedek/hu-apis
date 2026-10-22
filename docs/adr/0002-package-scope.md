# ADR 0002: Which APIs to cover first

- Status: accepted
- Date: 2026-10-22

## Context

The original idea was "typed SDKs for MNB, KSH and szamlazz.hu". Before writing code we
checked what already exists on npm (registry search, 2026-10-22, monthly downloads):

| Upstream                      | Existing packages                                                                                                                 | Gap                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| szamlazz.hu                   | `@ribbery009/szamlazz-ts` (~7.4k), `szamlazz.js` (~6k), `kassza` (~2.2k), all updated in 2025–2026                                | None worth filling                                            |
| Billingo                      | `@codingsans/billingo-client` (~1.2k), and an **official** `@billingo/billingo-mcp`                                               | None                                                          |
| NAV Online Számla             | `@angro/nav-connector` (~10k/month), but JavaScript only, no type definitions, last release January 2024, axios + lodash + xml2js | **Typed, modern, low-dependency client**                      |
| KSH                           | Nothing                                                                                                                           | **Whole API uncovered**                                       |
| MNB                           | `magyar-nemzeti-bank-exchange-rate` (~1.2k), `mnb-rates` (~0.5k)                                                                  | Small; useful as the shared foundation and for the MCP server |
| MCP for Hungarian public data | Only per-vendor servers (Billingo, Barion)                                                                                        | **One server spanning MNB + KSH (+ NAV later)**               |

## Decision

1. Drop szamlazz.hu and Billingo: a fourth client would not get users.
2. Build `@hu-apis/ksh` (no competitor) and `@hu-apis/mnb` first. Both are open, keyless
   APIs, so they are fully testable in CI.
3. `@hu-apis/nav` is the flagship library: a typed NAV Online Számla v3 client. It stays
   `private` until it is verified against NAV's test environment and official samples.
4. `@hu-apis/mcp` exposes everything to AI agents through one server.

## Consequences

- The project's pitch is "the missing pieces", not "another wrapper".
- NAV work needs a NAV test-environment technical user; that is the main external dependency.
