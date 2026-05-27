import crypto from 'crypto';

/**
 * Compute SHA-256 of a Buffer or string.
 * Returns a lowercase hex digest.
 */
export function sha256(input: Buffer | string): string {
  return crypto
    .createHash('sha256')
    .update(input)
    .digest('hex');
}

/**
 * Deterministically hash a JSON-serializable object.
 * Keys are sorted so { b:1, a:2 } and { a:2, b:1 } produce the same hash.
 */
export function hashObject(obj: Record<string, unknown>): string {
  const sorted = sortedStringify(obj);
  return sha256(sorted);
}

function sortedStringify(val: unknown): string {
  if (Array.isArray(val)) {
    return '[' + val.map(sortedStringify).join(',') + ']';
  }
  if (val !== null && typeof val === 'object') {
    const keys = Object.keys(val as object).sort();
    const pairs = keys.map(
      k => JSON.stringify(k) + ':' + sortedStringify((val as Record<string, unknown>)[k])
    );
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Generate a case ID in the format EVD-YYYY-XXXXXXXX
 * (8 random uppercase hex characters)
 */
export function generateCaseId(): string {
  const year = new Date().getFullYear();
  const hex  = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `EVD-${year}-${hex}`;
}
