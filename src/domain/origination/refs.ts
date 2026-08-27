export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export async function resolveByUuidOrPublicId<T>(
  ref: string,
  byId: (id: string) => Promise<T | null>,
  byPublicId: (publicId: string) => Promise<T | null>,
): Promise<T | null> {
  const value = ref.trim();
  if (!value) {
    return null;
  }
  if (isUuid(value)) {
    return byId(value);
  }
  return byPublicId(value);
}
