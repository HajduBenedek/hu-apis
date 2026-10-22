import { ParseError } from '@hu-apis/core';
import { XMLParser } from 'fast-xml-parser';

const NAMESPACE = 'http://www.mnb.hu/webservices/';
const SOAP_ACTION_PREFIX = `${NAMESPACE}MNBArfolyamServiceSoap/`;

export type MnbOperation = 'GetCurrentExchangeRates' | 'GetExchangeRates' | 'GetCurrencies';

/** Thrown when MNB answers with a SOAP fault (e.g. "Hibás dátumformátum"). Never retried. */
export class MnbSoapFault extends ParseError {
  override name = 'MnbSoapFault';
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'value',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'Day' || name === 'Rate' || name === 'Curr',
});

export function buildEnvelope(
  operation: MnbOperation,
  params: Record<string, string> = {},
): string {
  const body = Object.entries(params)
    .map(([key, value]) => `<web:${key}>${escapeXml(value)}</web:${key}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${NAMESPACE}">` +
    `<soap:Body><web:${operation}>${body}</web:${operation}></soap:Body></soap:Envelope>`
  );
}

export function soapHeaders(operation: MnbOperation): Record<string, string> {
  return {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: `"${SOAP_ACTION_PREFIX}${operation}"`,
  };
}

export function isSoapFault(xml: string): boolean {
  return /<(\w+:)?Fault>/.test(xml);
}

/**
 * MNB wraps its real payload as an XML-escaped string inside `<{operation}Result>`,
 * so the response has to be parsed twice: once for the envelope, once for the payload.
 */
export function unwrapResult(operation: MnbOperation, xml: string): unknown {
  const envelope = safeParse(xml) as SoapEnvelope;
  const body = envelope.Envelope?.Body;

  const fault = body?.Fault;
  if (fault) {
    // faultstring carries an xml:lang attribute, so the parser may return it as an object.
    const message =
      typeof fault.faultstring === 'string' ? fault.faultstring : fault.faultstring?.value;
    throw new MnbSoapFault(`MNB SOAP fault: ${message ?? 'unknown'}`);
  }

  const result = body?.[`${operation}Response`]?.[`${operation}Result`];
  if (typeof result !== 'string') {
    throw new ParseError(`MNB response has no ${operation}Result payload`);
  }
  return safeParse(result);
}

function safeParse(xml: string): unknown {
  try {
    return parser.parse(xml, true);
  } catch (error) {
    throw new ParseError('MNB returned malformed XML', { cause: error });
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Loose shape of the parsed envelope; everything is optional because we validate as we go.
interface SoapEnvelope {
  Envelope?: {
    Body?: Record<string, Record<string, unknown> | undefined> & {
      Fault?: { faultstring?: string | { value?: string } };
    };
  };
}
