import { HuApiError } from '@hu-apis/core';
import { createKshClient, type KshClient } from '@hu-apis/ksh';
import { createMnbClient, type MnbClient } from '@hu-apis/mnb';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export interface HuApisServerOptions {
  mnb?: MnbClient;
  ksh?: KshClient;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217, e.g. EUR');

export function createHuApisServer(options: HuApisServerOptions = {}): McpServer {
  const mnb = options.mnb ?? createMnbClient();
  const ksh = options.ksh ?? createKshClient();
  const server = new McpServer({ name: 'hu-apis', version: '0.0.0' });

  server.registerTool(
    'mnb_current_exchange_rates',
    {
      title: 'Current MNB exchange rates',
      description:
        'Official Hungarian National Bank (MNB) HUF exchange rates for the latest banking day. ' +
        '`rate` is the HUF value of `unit` units of the currency.',
      inputSchema: {
        currencies: z.array(currencyCode).optional().describe('Filter, e.g. ["EUR","USD"]'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ currencies }) =>
      run(async () => {
        const day = await mnb.getCurrentExchangeRates();
        const rates = currencies?.length
          ? day.rates.filter((r) => currencies.includes(r.currency))
          : day.rates;
        return { date: day.date, rates };
      }),
  );

  server.registerTool(
    'mnb_exchange_rate_history',
    {
      title: 'Historical MNB exchange rates',
      description:
        'Official MNB HUF exchange rates for a date range (inclusive). Weekends and Hungarian ' +
        'bank holidays have no rates, so the result skips those days.',
      inputSchema: {
        from: isoDate.describe('First day, YYYY-MM-DD'),
        to: isoDate.describe('Last day, YYYY-MM-DD'),
        currencies: z.array(currencyCode).min(1),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ from, to, currencies }) => run(() => mnb.getExchangeRates({ from, to, currencies })),
  );

  server.registerTool(
    'ksh_search_datasets',
    {
      title: 'Search KSH datasets',
      description:
        'Search the Hungarian Central Statistical Office (KSH) high-value datasets by Hungarian or ' +
        'English keyword (accents optional). Omit the query to list all datasets.',
      inputSchema: { query: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query }) => run(() => (query ? ksh.searchDatasets(query) : ksh.listDatasets())),
  );

  server.registerTool(
    'ksh_get_dataset',
    {
      title: 'KSH dataset details',
      description:
        'Metadata of one KSH dataset, including CSV download URLs and the years each file covers.',
      inputSchema: { id: z.string().uuid().describe('Dataset id from ksh_search_datasets') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => ksh.getDataset(id)),
  );

  return server;
}

/**
 * Tool failures are returned as `isError` results rather than thrown, so the model sees the
 * message (e.g. an invalid date range) and can correct its call.
 */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    if (!(error instanceof HuApiError)) throw error;
    return { isError: true, content: [{ type: 'text', text: `${error.name}: ${error.message}` }] };
  }
}
