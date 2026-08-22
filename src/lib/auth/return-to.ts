const SAFE_RETURN = /^\/(?!\/|\\)/;

export function safeReturnTo(value: string | null | undefined): string {
  if (!value) {
    return "/";
  }
  const trimmed = value.trim();
  if (!SAFE_RETURN.test(trimmed)) {
    return "/";
  }
  if (trimmed.includes("://") || trimmed.includes("\\")) {
    return "/";
  }
  return trimmed;
}
