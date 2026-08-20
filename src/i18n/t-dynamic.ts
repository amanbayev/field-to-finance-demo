export function lookupMessage(
  translate: (key: never) => string,
  key: string,
): string {
  return translate(key as never);
}
