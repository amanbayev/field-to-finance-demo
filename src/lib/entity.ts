export function entityHref(
  type: string | undefined,
  id: string | undefined,
): string | undefined {
  if (!type || !id) {
    return undefined;
  }

  switch (type) {
    case "contract":
      return `/contracts/${id}`;
    case "pool":
    case "coverage":
      return `/pools/${id}`;
    case "token":
      return "/tokens";
    case "placement":
      return `/market/${id}`;
    default:
      return undefined;
  }
}
