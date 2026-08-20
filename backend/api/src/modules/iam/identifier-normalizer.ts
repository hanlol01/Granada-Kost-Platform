/**
 * Canonicalizes identifiers used by the login lookup and rate limiter.
 *
 * Phone numbers remain stored in the canonical Indonesian `62...` form;
 * this only makes equivalent user-entered forms resolve to that value.
 */
export function normalizeLoginIdentifier(rawIdentifier: string): string {
  const identifier = rawIdentifier.trim();

  if (identifier.includes('@')) {
    return identifier.toLowerCase();
  }

  const compactPhone = identifier.replace(/[\s().-]/g, '');
  if (/^\+62\d+$/.test(compactPhone)) {
    return compactPhone.slice(1);
  }
  if (/^62\d+$/.test(compactPhone)) {
    return compactPhone;
  }
  if (/^0\d+$/.test(compactPhone)) {
    return `62${compactPhone.slice(1)}`;
  }

  return identifier;
}
