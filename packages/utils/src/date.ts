export function formatDate(date: Date, locale = "en-US"): string {
  return date.toLocaleDateString(locale);
}

export function parseIsoDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
