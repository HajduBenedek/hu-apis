import { createMnbClient } from '@hu-apis/mnb';
import { describe, expect, it } from 'vitest';

// Contract tests against the real service. Run with `pnpm test:live`; CI runs them nightly
// so upstream format changes show up as a red build instead of a user bug report.
describe.skipIf(!process.env.LIVE)('MNB live contract', () => {
  const client = createMnbClient();

  it('publishes a EUR rate for the latest banking day', async () => {
    const day = await client.getCurrentExchangeRates();
    const eur = day.rates.find((r) => r.currency === 'EUR');

    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(eur?.unit).toBe(1);
    expect(eur?.rate).toBeGreaterThan(100);
  });

  it('still lists EUR among the currencies', async () => {
    await expect(client.getCurrencies()).resolves.toContain('EUR');
  });
});
