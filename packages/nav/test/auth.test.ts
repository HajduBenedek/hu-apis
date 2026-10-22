import { createHash } from 'node:crypto';
import { ValidationError } from '@hu-apis/core';
import { computeRequestSignature, formatSignatureTimestamp, hashPassword } from '@hu-apis/nav';
import { describe, expect, it } from 'vitest';

// These tests pin the composition rules. They are NOT a substitute for NAV's official
// sample values, which still need to be added before this package is published.
const sha3 = (s: string) => createHash('sha3-512').update(s).digest('hex').toUpperCase();

const base = {
  requestId: 'RID_2026_0001',
  timestamp: new Date('2026-10-22T08:15:30.123Z'),
  signatureKey: 'ce-8f5e-215119fa7dd621DLMRHRLH2S',
};

describe('formatSignatureTimestamp', () => {
  it('uses UTC and drops milliseconds', () => {
    expect(formatSignatureTimestamp(base.timestamp)).toBe('20261022081530');
  });
});

describe('hashPassword', () => {
  it('is uppercase hex SHA-512', () => {
    expect(hashPassword('password')).toMatch(/^[0-9A-F]{128}$/);
    expect(hashPassword('password')).toBe(
      createHash('sha512').update('password').digest('hex').toUpperCase(),
    );
  });
});

describe('computeRequestSignature', () => {
  it('partial signature = SHA3-512(requestId + timestamp + key)', () => {
    expect(computeRequestSignature(base)).toBe(
      sha3(['RID_2026_0001', '20261022081530', base.signatureKey].join('')),
    );
  });

  it('full signature appends per-invoice hashes in index order', () => {
    const signature = computeRequestSignature({
      ...base,
      invoiceOperations: [
        { operation: 'CREATE', invoiceDataBase64: 'PEludm9pY2VEYXRhLz4=' },
        { operation: 'STORNO', invoiceDataBase64: 'PEludm9pY2VEYXRhIC8+' },
      ],
    });

    const expected = sha3(
      [
        'RID_2026_0001',
        '20261022081530',
        base.signatureKey,
        sha3('CREATEPEludm9pY2VEYXRhLz4='),
        sha3('STORNOPEludm9pY2VEYXRhIC8+'),
      ].join(''),
    );
    expect(signature).toBe(expected);
  });

  it.each(['', 'has space', 'x'.repeat(31), 'ékezet'])('rejects requestId %j', (requestId) => {
    expect(() => computeRequestSignature({ ...base, requestId })).toThrow(ValidationError);
  });
});
