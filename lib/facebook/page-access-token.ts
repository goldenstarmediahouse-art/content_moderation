export type PageAccessTokenValidation =
  | { valid: true; token: string }
  | { valid: false; error: string };

export function normalizePageAccessToken(value: unknown): PageAccessTokenValidation {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Enter the raw Facebook Page Access Token.' };
  }

  if (/[\r\n]/.test(value)) {
    return {
      valid: false,
      error: 'The Page Access Token must be a single line. Paste only the raw token value.',
    };
  }

  const token = value.trim();
  if (!token) {
    return { valid: false, error: 'Enter the raw Facebook Page Access Token.' };
  }

  if (/[\u0000-\u0020\u007f-\u009f"'{}\[\],:]/.test(token) || /[^\x21-\x7e]/.test(token)) {
    return {
      valid: false,
      error: 'The Page Access Token contains invalid characters. Paste only the raw token value, without quotes or JSON.',
    };
  }

  return { valid: true, token };
}
