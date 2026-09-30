const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Extracts unique email addresses from a CSV / TXT file's contents.
 * Works for any column layout (header row, multiple columns, one-per-line,
 * semicolon separated...) because it scans every cell for email patterns.
 */
export function extractEmails(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(EMAIL_RE)) seen.add(match[0].toLowerCase());
  return [...seen];
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
