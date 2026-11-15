/**
 * A file name for an entry's id. A token's id may contain slashes (it doubles as its DTCG path), and
 * a slash in a file name would mean a folder, so each run of characters other than letters, digits,
 * dots, underscores and dashes becomes one dash.
 */
export function fileNameForId(id: string): string {
  const name = id
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/-{2,}/g, '-');
  return name || 'entry';
}
