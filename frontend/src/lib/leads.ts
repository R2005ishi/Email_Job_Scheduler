const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// Finds all unique email addresses in the file, whatever the column layout is
export function extractEmails(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(EMAIL_RE)) seen.add(match[0].toLowerCase());
  return [...seen];
}
