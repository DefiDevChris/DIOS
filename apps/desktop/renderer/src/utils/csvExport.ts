function escapeField(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv<T extends Record<string, unknown>>(
  data: T[],
  columns: (keyof T & string)[],
  labels?: Partial<Record<keyof T & string, string>>
): string {
  const headerRow = columns.map(col => labels?.[col] ?? col).join(',');
  const dataRows = data.map(row =>
    columns.map(col => escapeField(row[col])).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
