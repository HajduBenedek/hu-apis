# @hu-apis/nav (work in progress)

A typed, low-dependency client for the NAV Online Számla (Online Invoice) API v3.0.

**Not published yet.** What exists today:
- `hashPassword(password)`: the `passwordHash` element (SHA-512, uppercase hex)
- `computeRequestSignature({ requestId, timestamp, signatureKey, invoiceOperations? })`:
  the partial and full `requestSignature` (SHA3-512, uppercase hex)

## Before the first release

1. Add NAV's official sample values from the interface specification as test vectors.
   The current tests only pin the composition rules.
2. Register a technical user in the NAV **test** environment and record fixtures for
   `tokenExchange`, `queryTaxpayer` and `queryInvoiceDigest`.
3. Implement token decryption (AES-128-ECB with the exchange key).

The existing JavaScript client, `@angro/nav-connector`, is the reference point to beat:
it works, but ships no types and has not been released since January 2024.
