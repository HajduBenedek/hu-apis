import { createHash } from 'node:crypto';
import { ValidationError } from '@hu-apis/core';

/**
 * Authentication helpers for NAV Online Számla API v3.0, following the
 * "Online Számla interfész specifikáció" (requestSignature and passwordHash chapters).
 *
 * STATUS: not yet verified against NAV's published sample values; see packages/nav/README.md.
 */

const REQUEST_ID = /^[+a-zA-Z0-9_]{1,30}$/;

export type InvoiceOperationType = 'CREATE' | 'MODIFY' | 'STORNO' | 'ANNUL';

export interface InvoiceOperationForSignature {
  operation: InvoiceOperationType;
  /** Base64-encoded invoice XML, exactly as sent in `invoiceData`. */
  invoiceDataBase64: string;
}

export interface RequestSignatureInput {
  requestId: string;
  /** The same instant sent in the request header's `timestamp` element. */
  timestamp: Date;
  /** The technical user's XML signing key ("XML aláírókulcs"). */
  signatureKey: string;
  /**
   * Only for manageInvoice / manageAnnulment, in `index` order. When present, the
   * "full" signature is computed; otherwise the "partial" one used by every other operation.
   */
  invoiceOperations?: InvoiceOperationForSignature[];
}

/** `passwordHash`: uppercase hex SHA-512 of the technical user's password (cryptoType="SHA-512"). */
export function hashPassword(password: string): string {
  return createHash('sha512').update(password, 'utf8').digest('hex').toUpperCase();
}

/** `requestSignature`: uppercase hex SHA3-512 (cryptoType="SHA3-512"). */
export function computeRequestSignature(input: RequestSignatureInput): string {
  if (!REQUEST_ID.test(input.requestId)) {
    throw new ValidationError('requestId must be 1-30 characters of [+a-zA-Z0-9_]');
  }
  if (!input.signatureKey) throw new ValidationError('signatureKey is required');

  const partial = input.requestId + formatSignatureTimestamp(input.timestamp) + input.signatureKey;
  const invoiceHashes = (input.invoiceOperations ?? [])
    .map(({ operation, invoiceDataBase64 }) => sha3(operation + invoiceDataBase64))
    .join('');

  return sha3(partial + invoiceHashes);
}

/** The timestamp part of the signature: header timestamp in UTC as YYYYMMDDhhmmss (no millis). */
export function formatSignatureTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new ValidationError('timestamp is an invalid Date');
  return date.toISOString().slice(0, 19).replace(/[-T:]/g, '');
}

function sha3(value: string): string {
  return createHash('sha3-512').update(value, 'utf8').digest('hex').toUpperCase();
}
