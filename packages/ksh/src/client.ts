import {
  createHttpClient,
  type HttpClientOptions,
  ParseError,
  ValidationError,
} from '@hu-apis/core';
import { XMLParser } from 'fast-xml-parser';

export const KSH_DEFAULT_BASE_URL = 'https://data.ksh.hu';

export interface KshClientOptions extends HttpClientOptions {
  baseUrl?: string;
}

export interface Localized<T> {
  hu: T;
  en: T;
}

export interface DatasetSummary {
  id: string;
  title: Localized<string>;
  keywords: Localized<string[]>;
  themes: Localized<string[]>;
}

export interface Distribution {
  /** Direct CSV download URL. */
  downloadUrl: string;
  /** SDMX structure definition the CSV conforms to. */
  schemaUrl?: string;
  /** EU file-type code, e.g. "CSV". */
  format?: string;
  /** Years covered, as published (gYear strings like "2021"). */
  period?: { start?: string; end?: string };
  modified?: string;
  license?: string;
}

export interface DatasetDetails extends DatasetSummary {
  description: Localized<string>;
  /** EU frequency code, e.g. "ANNUAL". */
  frequency?: string;
  distributions: Distribution[];
}

export interface KshClient {
  listDatasets(options?: { signal?: AbortSignal }): Promise<DatasetSummary[]>;
  /** Case- and accent-insensitive search over titles and keywords in both languages. */
  searchDatasets(query: string, options?: { signal?: AbortSignal }): Promise<DatasetSummary[]>;
  getDataset(id: string, options?: { signal?: AbortSignal }): Promise<DatasetDetails>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createKshClient(options: KshClientOptions = {}): KshClient {
  const { baseUrl = KSH_DEFAULT_BASE_URL, ...httpOptions } = options;
  const http = createHttpClient(httpOptions);

  async function listDatasets({ signal }: { signal?: AbortSignal } = {}) {
    const text = await http.requestText(`${baseUrl}/datasets.json`, signal ? { signal } : {});
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new ParseError('KSH datasets.json is not valid JSON', { cause: error });
    }
    if (!Array.isArray(raw)) throw new ParseError('KSH datasets.json is not an array');
    return raw.map(normalizeSummary);
  }

  return {
    listDatasets,

    async searchDatasets(query, options) {
      const needle = fold(query);
      const datasets = await listDatasets(options);
      return datasets.filter((d) =>
        [d.title.hu, d.title.en, ...d.keywords.hu, ...d.keywords.en].some((text) =>
          fold(text).includes(needle),
        ),
      );
    },

    async getDataset(id, { signal } = {}) {
      if (!UUID.test(id)) throw new ValidationError(`KSH dataset ids are UUIDs, got "${id}"`);
      const xml = await http.requestText(
        `${baseUrl}/datasets/${encodeURIComponent(id)}/metadata.rdf`,
        signal ? { signal } : {},
      );
      return parseDatasetRdf(xml);
    },
  };
}

interface RawSummary {
  id?: string;
  titles?: Partial<Localized<string>>;
  keywords?: Partial<Localized<string[]>>;
  /** The published OpenAPI spec calls this field `tags`; the live API sends `keywords`. */
  tags?: Partial<Localized<string[]>>;
  themes?: Partial<Localized<string[]>>;
}

function normalizeSummary(raw: RawSummary): DatasetSummary {
  if (!raw.id || !raw.titles)
    throw new ParseError(`KSH dataset entry without id/title: ${JSON.stringify(raw)}`);
  const keywords = raw.keywords ?? raw.tags ?? {};
  return {
    id: raw.id,
    title: { hu: raw.titles.hu ?? raw.titles.en ?? '', en: raw.titles.en ?? raw.titles.hu ?? '' },
    keywords: { hu: keywords.hu ?? [], en: keywords.en ?? [] },
    themes: { hu: raw.themes?.hu ?? [], en: raw.themes?.en ?? [] },
  };
}

// ---- RDF/XML (DCAT-AP) parsing -------------------------------------------------------------

type Node = Record<string, unknown>;

const rdfParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ['title', 'description', 'keyword', 'theme', 'prefLabel', 'distribution'].includes(name),
});

export function parseDatasetRdf(xml: string): DatasetDetails {
  let doc: Node;
  try {
    doc = rdfParser.parse(xml, true) as Node;
  } catch (error) {
    throw new ParseError('KSH metadata.rdf is not valid XML', { cause: error });
  }
  const dataset = (doc.RDF as Node | undefined)?.Dataset as Node | undefined;
  if (!dataset) throw new ParseError('KSH metadata.rdf has no dcat:Dataset');

  const id = text(dataset.identifier);
  if (!id) throw new ParseError('KSH dataset has no dct:identifier');

  const keywords = asArray(dataset.keyword) as Node[];
  const themeLabels = asArray(dataset.theme).flatMap((t) =>
    asArray(((t as Node).Concept as Node | undefined)?.prefLabel),
  ) as Node[];

  return {
    id,
    title: localized(dataset.title),
    description: localized(dataset.description),
    keywords: {
      hu: keywords.filter((k) => k['@lang'] === 'hu').map(text),
      en: keywords.filter((k) => k['@lang'] === 'en').map(text),
    },
    themes: {
      hu: themeLabels.filter((l) => l['@lang'] === 'hu').map(text),
      en: themeLabels.filter((l) => l['@lang'] === 'en').map(text),
    },
    ...optional(
      'frequency',
      euCode(((dataset.accrualPeriodicity as Node)?.Frequency as Node)?.['@about']),
    ),
    distributions: asArray(dataset.distribution).map((d) =>
      parseDistribution((d as Node).Distribution as Node),
    ),
  };
}

function parseDistribution(node: Node | undefined): Distribution {
  const downloadUrl = text(node?.downloadURL);
  if (!node || !downloadUrl) throw new ParseError('KSH distribution without dcat:downloadURL');
  const period = (node.temporal as Node | undefined)?.PeriodOfTime as Node | undefined;
  return {
    downloadUrl,
    ...optional('schemaUrl', attr(node.conformsTo, '@resource')),
    ...optional('format', euCode(attr(node.format, '@resource'))),
    ...(period
      ? {
          period: {
            ...optional('start', text(period.startDate)),
            ...optional('end', text(period.endDate)),
          },
        }
      : {}),
    ...optional('modified', text(node.modified)),
    ...optional('license', attr(node.license, '@resource')),
  };
}

function localized(value: unknown): Localized<string> {
  const items = asArray(value) as Node[];
  const pick = (lang: string) => text(items.find((i) => i['@lang'] === lang));
  return { hu: pick('hu') || pick('en'), en: pick('en') || pick('hu') };
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && '#text' in value)
    return String((value as Node)['#text']).trim();
  return '';
}

function attr(value: unknown, name: string): string | undefined {
  const v = (value as Node | undefined)?.[name];
  return typeof v === 'string' ? v.trim() : undefined;
}

/** "http://publications.europa.eu/resource/authority/file-type/CSV" -> "CSV" */
function euCode(uri: unknown): string | undefined {
  return typeof uri === 'string' ? uri.split('/').pop() : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Spreads `{ [key]: value }` only when value is non-empty, keeping optional fields truly absent. */
function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return value ? ({ [key]: value } as { [P in K]?: string }) : {};
}

/** Lowercases and strips accents so "nepesseg" matches "Népesség". */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
