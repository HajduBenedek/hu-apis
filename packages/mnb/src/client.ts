import {
  createHttpClient,
  type HttpClientOptions,
  HttpError,
  isRetryableError,
  ParseError,
  ValidationError,
} from '@hu-apis/core';
import {
  buildEnvelope,
  isSoapFault,
  type MnbOperation,
  soapHeaders,
  unwrapResult,
} from './soap.js';

/**
 * The service only answers over plain HTTP: the HTTPS endpoint returns 404 for SOAP calls
 * (checked 2026-10-22). Override `endpoint` if MNB ever fixes this or you use a proxy.
 */
export const MNB_DEFAULT_ENDPOINT = 'http://www.mnb.hu/arfolyamok.asmx';

export interface MnbClientOptions extends HttpClientOptions {
  endpoint?: string;
}

export interface ExchangeRate {
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
  /** How many units of `currency` the published rate refers to (100 for JPY, KRW, IDR). */
  unit: number;
  /** HUF value of `unit` units, exactly as MNB publishes it. */
  rate: number;
  /** HUF value of a single unit (`rate / unit`). */
  hufPerUnit: number;
}

export interface ExchangeRateDay {
  /** Banking day in YYYY-MM-DD. MNB publishes no rates on weekends and holidays. */
  date: string;
  rates: ExchangeRate[];
}

export interface ExchangeRatesQuery {
  /** First day, inclusive, YYYY-MM-DD. */
  from: string;
  /** Last day, inclusive, YYYY-MM-DD. */
  to: string;
  /** ISO 4217 codes. */
  currencies: string[];
  signal?: AbortSignal;
}

export interface MnbClient {
  /** Rates of the latest published banking day. */
  getCurrentExchangeRates(options?: { signal?: AbortSignal }): Promise<ExchangeRateDay>;
  /** Rates for a date range, oldest day first. Days without any requested currency are omitted. */
  getExchangeRates(query: ExchangeRatesQuery): Promise<ExchangeRateDay[]>;
  /** Every currency code MNB has ever published a rate for. */
  getCurrencies(options?: { signal?: AbortSignal }): Promise<string[]>;
}

export function createMnbClient(options: MnbClientOptions = {}): MnbClient {
  const { endpoint = MNB_DEFAULT_ENDPOINT, ...httpOptions } = options;
  const http = createHttpClient(httpOptions);

  async function call(
    operation: MnbOperation,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let xml: string;
    try {
      xml = await http.requestText(endpoint, {
        method: 'POST',
        headers: soapHeaders(operation),
        body: buildEnvelope(operation, params),
        ...(signal ? { signal } : {}),
        // MNB reports bad input as a SOAP fault with HTTP 500; retrying it is pointless.
        isRetryable: (error) =>
          !(error instanceof HttpError && isSoapFault(error.body)) && isRetryableError(error),
      });
    } catch (error) {
      if (error instanceof HttpError && isSoapFault(error.body)) xml = error.body;
      else throw error;
    }
    return unwrapResult(operation, xml);
  }

  return {
    async getCurrentExchangeRates({ signal } = {}) {
      const payload = await call('GetCurrentExchangeRates', undefined, signal);
      const [day] = parseDays(payload, 'MNBCurrentExchangeRates');
      if (!day) throw new ParseError('MNB returned no current exchange rates');
      return day;
    },

    async getExchangeRates({ from, to, currencies, signal }) {
      assertDate('from', from);
      assertDate('to', to);
      if (from > to) throw new ValidationError(`"from" (${from}) is after "to" (${to})`);
      if (currencies.length === 0) throw new ValidationError('At least one currency is required');
      for (const code of currencies) {
        if (!/^[A-Z]{3}$/.test(code)) throw new ValidationError(`Invalid ISO 4217 code: "${code}"`);
      }

      const payload = await call(
        'GetExchangeRates',
        { startDate: from, endDate: to, currencyNames: currencies.join(',') },
        signal,
      );
      return parseDays(payload, 'MNBExchangeRates')
        .filter((day) => day.rates.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getCurrencies({ signal } = {}) {
      const payload = (await call('GetCurrencies', undefined, signal)) as {
        MNBCurrencies?: { Currencies?: { Curr?: string[] } };
      };
      const codes = payload.MNBCurrencies?.Currencies?.Curr;
      if (!codes) throw new ParseError('MNB currency list is missing');
      return codes;
    },
  };
}

interface RawRate {
  unit?: string;
  curr?: string;
  value?: string;
}

function parseDays(payload: unknown, root: string): ExchangeRateDay[] {
  const container = (payload as Record<string, unknown>)[root];
  // An empty range comes back as a self-closing root element, which parses to "".
  if (container === '' || container === undefined) return [];
  const days = (container as { Day?: Array<{ date?: string; Rate?: RawRate[] }> }).Day ?? [];

  return days.map((day) => {
    if (!day.date) throw new ParseError('MNB day without a date attribute');
    return { date: day.date, rates: (day.Rate ?? []).map(parseRate) };
  });
}

function parseRate(raw: RawRate): ExchangeRate {
  const unit = Number(raw.unit);
  // MNB uses a decimal comma: "365,28000".
  const rate = Number(raw.value?.replace(',', '.'));
  if (!raw.curr || !Number.isFinite(unit) || unit <= 0 || !Number.isFinite(rate)) {
    throw new ParseError(`Unparseable MNB rate: ${JSON.stringify(raw)}`);
  }
  return { currency: raw.curr, unit, rate, hufPerUnit: rate / unit };
}

function assertDate(field: string, value: string): void {
  // Round-tripping through Date rejects impossible days like 2026-02-30.
  const parsed = new Date(`${value}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
  if (!valid)
    throw new ValidationError(`"${field}" must be a real date in YYYY-MM-DD, got "${value}"`);
}
