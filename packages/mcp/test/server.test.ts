import { ValidationError } from '@hu-apis/core';
import type { KshClient } from '@hu-apis/ksh';
import type { MnbClient } from '@hu-apis/mnb';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createHuApisServer } from '../src/server.js';

const day = {
  date: '2026-10-21',
  rates: [
    { currency: 'EUR', unit: 1, rate: 365.28, hufPerUnit: 365.28 },
    { currency: 'USD', unit: 1, rate: 325.53, hufPerUnit: 325.53 },
  ],
};

async function connect(overrides: { mnb?: Partial<MnbClient>; ksh?: Partial<KshClient> } = {}) {
  const server = createHuApisServer({
    mnb: overrides.mnb as MnbClient,
    ksh: overrides.ksh as KshClient,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';

describe('hu-apis MCP server', () => {
  it('advertises read-only tools', async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'ksh_get_dataset',
      'ksh_search_datasets',
      'mnb_current_exchange_rates',
      'mnb_exchange_rate_history',
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it('filters current rates by currency', async () => {
    const client = await connect({ mnb: { getCurrentExchangeRates: async () => day } });

    const result = await client.callTool({
      name: 'mnb_current_exchange_rates',
      arguments: { currencies: ['EUR'] },
    });

    expect(JSON.parse(textOf(result))).toEqual({ date: '2026-10-21', rates: [day.rates[0]] });
  });

  it('returns validation failures to the model instead of crashing', async () => {
    const getExchangeRates = vi.fn().mockRejectedValue(new ValidationError('"from" is after "to"'));
    const client = await connect({ mnb: { getExchangeRates } });

    const result = await client.callTool({
      name: 'mnb_exchange_rate_history',
      arguments: { from: '2026-10-21', to: '2026-10-19', currencies: ['EUR'] },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('"from" is after "to"');
  });

  it('routes an empty KSH query to the full list', async () => {
    const listDatasets = vi.fn().mockResolvedValue([]);
    const searchDatasets = vi.fn();
    const client = await connect({ ksh: { listDatasets, searchDatasets } });

    await client.callTool({ name: 'ksh_search_datasets', arguments: {} });

    expect(listDatasets).toHaveBeenCalledOnce();
    expect(searchDatasets).not.toHaveBeenCalled();
  });
});
