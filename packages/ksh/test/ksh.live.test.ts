import { createKshClient } from '@hu-apis/ksh';
import { describe, expect, it } from 'vitest';

describe.skipIf(!process.env.LIVE)('KSH live contract', () => {
  const client = createKshClient();

  it('lists datasets and resolves the first one to downloadable CSVs', async () => {
    const [first] = await client.listDatasets();
    expect(first).toBeDefined();

    const details = await client.getDataset(first?.id ?? '');
    expect(details.distributions.length).toBeGreaterThan(0);
    expect(details.distributions[0]?.downloadUrl).toMatch(/^https:\/\/data\.ksh\.hu\/.+\.csv$/);
  });
});
