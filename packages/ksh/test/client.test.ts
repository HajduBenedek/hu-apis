import { readFileSync } from 'node:fs';
import { HttpError, ValidationError } from '@hu-apis/core';
import { createKshClient } from '@hu-apis/ksh';
import { describe, expect, it, vi } from 'vitest';

// Fixtures are verbatim responses recorded from data.ksh.hu on 2026-10-22.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const INDUSTRIAL_PRODUCTION = '350ebb20-e655-496a-9045-352c287fbe50';

function clientReturning(body: string, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response(body, { status }));
  return { fetch, client: createKshClient({ fetch, retryBaseDelayMs: 0 }) };
}

describe('listDatasets', () => {
  it('normalizes every published dataset', async () => {
    const { client, fetch } = clientReturning(fixture('datasets.json'));

    const datasets = await client.listDatasets();

    expect(fetch.mock.calls[0]?.[0]).toBe('https://data.ksh.hu/datasets.json');
    expect(datasets).toHaveLength(13);
    expect(datasets[0]).toEqual({
      id: INDUSTRIAL_PRODUCTION,
      title: { hu: 'HVD - Ipari termelés', en: 'HVD - Industrial production' },
      keywords: {
        hu: expect.arrayContaining(['ipari termelés']),
        en: expect.arrayContaining(['industrial production']),
      },
      themes: { hu: ['Gazdaság és pénzügy'], en: ['Economy and finance'] },
    });
  });

  it('accepts the `tags` field named in the OpenAPI spec as well as the live `keywords`', async () => {
    const body = JSON.stringify([
      { id: 'x', titles: { hu: 'A', en: 'A' }, tags: { hu: ['címke'], en: ['tag'] } },
    ]);
    const { client } = clientReturning(body);

    const [dataset] = await client.listDatasets();

    expect(dataset?.keywords).toEqual({ hu: ['címke'], en: ['tag'] });
  });
});

describe('searchDatasets', () => {
  it.each([
    ['nepesseg', 'HVD - Népesség'],
    ['MORTALITY', 'HVD - Mortalitás'],
    ['fogyasztói ár', 'HVD - Harmonizált fogyasztói árindexek'],
  ])('finds %j regardless of case and accents', async (query, expectedTitle) => {
    const { client } = clientReturning(fixture('datasets.json'));

    const results = await client.searchDatasets(query);

    expect(results.map((d) => d.title.hu)).toContain(expectedTitle);
  });
});

describe('getDataset', () => {
  it('parses DCAT-AP metadata including every CSV distribution', async () => {
    const { client, fetch } = clientReturning(fixture('metadata.rdf'));

    const dataset = await client.getDataset(INDUSTRIAL_PRODUCTION);

    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://data.ksh.hu/datasets/${INDUSTRIAL_PRODUCTION}/metadata.rdf`,
    );
    expect(dataset.id).toBe(INDUSTRIAL_PRODUCTION);
    expect(dataset.title.en).toBe('HVD - Industrial production');
    expect(dataset.frequency).toBe('ANNUAL');
    expect(dataset.themes.en.length).toBeGreaterThan(0);
    expect(dataset.distributions).toHaveLength(2);
    expect(dataset.distributions[0]).toEqual({
      downloadUrl: `https://data.ksh.hu/datasets/${INDUSTRIAL_PRODUCTION}/data/43652871-bb56-47ee-8678-6b1dac2fd11b.csv`,
      schemaUrl: `https://data.ksh.hu/datasets/${INDUSTRIAL_PRODUCTION}/schema/43652871-bb56-47ee-8678-6b1dac2fd11b.xml`,
      format: 'CSV',
      period: { start: '2021', end: '2021' },
      modified: '2025-02-18T10:59:34.000Z',
      license: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('rejects ids that cannot exist without calling KSH', async () => {
    const { client, fetch } = clientReturning('');

    await expect(client.getDataset('../../etc')).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports an unknown dataset as a 404 HttpError', async () => {
    const { client } = clientReturning('<html>Not Found</html>', 404);

    const error = await client
      .getDataset('00000000-0000-0000-0000-000000000000')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
  });
});
