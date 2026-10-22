import { readFileSync } from 'node:fs';
import { ValidationError } from '@hu-apis/core';
import { createMnbClient, MnbSoapFault } from '@hu-apis/mnb';
import { describe, expect, it, vi } from 'vitest';

// Fixtures are verbatim responses recorded from the live service on 2026-10-22.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function clientReturning(body: string, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response(body, { status }));
  return { fetch, client: createMnbClient({ fetch, retryBaseDelayMs: 0 }) };
}

describe('getCurrentExchangeRates', () => {
  it('parses the latest banking day with units and decimal commas', async () => {
    const { client } = clientReturning(fixture('current-exchange-rates.xml'));

    const day = await client.getCurrentExchangeRates();

    expect(day.date).toBe('2026-10-21');
    expect(day.rates.find((r) => r.currency === 'EUR')).toEqual({
      currency: 'EUR',
      unit: 1,
      rate: 365.28,
      hufPerUnit: 365.28,
    });
    const jpy = day.rates.find((r) => r.currency === 'JPY');
    expect(jpy?.unit).toBe(100);
    expect(jpy?.hufPerUnit).toBeCloseTo(2.0582);
  });

  it('sends the SOAPAction header MNB routes on', async () => {
    const { client, fetch } = clientReturning(fixture('current-exchange-rates.xml'));

    await client.getCurrentExchangeRates();

    const init = fetch.mock.calls[0]?.[1] ?? {};
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).SOAPAction).toBe(
      '"http://www.mnb.hu/webservices/MNBArfolyamServiceSoap/GetCurrentExchangeRates"',
    );
  });
});

describe('getExchangeRates', () => {
  const query = { from: '2026-10-19', to: '2026-10-21', currencies: ['EUR', 'USD', 'JPY'] };

  it('returns days oldest first', async () => {
    const { client } = clientReturning(fixture('exchange-rates-range.xml'));

    const days = await client.getExchangeRates(query);

    expect(days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(days[0]?.rates.map((r) => r.currency)).toEqual(['EUR', 'JPY', 'USD']);
  });

  it('puts the query into the SOAP body', async () => {
    const { client, fetch } = clientReturning(fixture('exchange-rates-range.xml'));

    await client.getExchangeRates(query);

    const body = String(fetch.mock.calls[0]?.[1]?.body);
    expect(body).toContain('<web:startDate>2026-10-19</web:startDate>');
    expect(body).toContain('<web:currencyNames>EUR,USD,JPY</web:currencyNames>');
  });

  it('returns an empty list for a weekend-only range', async () => {
    const { client } = clientReturning(fixture('exchange-rates-empty.xml'));

    await expect(
      client.getExchangeRates({ from: '2026-10-17', to: '2026-10-18', currencies: ['EUR'] }),
    ).resolves.toEqual([]);
  });

  it('drops the empty days MNB returns for an unknown currency', async () => {
    const { client } = clientReturning(fixture('exchange-rates-unknown-currency.xml'));

    await expect(client.getExchangeRates({ ...query, currencies: ['XXX'] })).resolves.toEqual([]);
  });

  it.each([
    [{ from: '2026-10-21', to: '2026-10-19' }, /after/],
    [{ from: '2026-02-30' }, /real date/],
    [{ to: '21/10/2026' }, /real date/],
    [{ currencies: [] }, /At least one/],
    [{ currencies: ['eur'] }, /ISO 4217/],
  ])('rejects %o before calling MNB', async (override, message) => {
    // MNB silently returns nothing for an inverted range, so we validate client-side.
    const { client, fetch } = clientReturning('');

    await expect(client.getExchangeRates({ ...query, ...override })).rejects.toThrow(message);
    await expect(client.getExchangeRates({ ...query, ...override })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('getCurrencies', () => {
  it('lists currency codes', async () => {
    const { client } = clientReturning(fixture('currencies.xml'));

    const codes = await client.getCurrencies();

    expect(codes).toContain('EUR');
    expect(codes).toContain('HUF');
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
  });
});

describe('SOAP faults', () => {
  it('surfaces the fault message and does not retry', async () => {
    const { client, fetch } = clientReturning(fixture('soap-fault.xml'), 500);

    const error = await client.getCurrentExchangeRates().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MnbSoapFault);
    expect((error as Error).message).toContain('Hibás dátumformát');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
