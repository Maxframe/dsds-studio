/**
 * The platforms a system ships on (`metadata.platforms` of the system entry). Each is an id: lowercase
 * words joined by dashes. Names are written with commas, semicolons or new lines between them, so a
 * name with a space in it ("React Native") stays one platform (`react-native`).
 */
const toId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Valid, unique platform ids from a list of names, in the order given. */
export function normalizePlatforms(names: readonly string[]): string[] {
  return [...new Set(names.map(toId).filter(Boolean))];
}

/** Platform ids from what a person typed. */
export function parsePlatforms(text: string): string[] {
  return normalizePlatforms(text.split(/[,;\n]+/));
}
