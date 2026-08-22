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
      return `/pools/${id}`;
    case "coverage":
      return "/coverage";
    case "token":
      return "/instruments/WHEAT-2027";
    case "issuance":
      return `/issuances/${id}`;
    case "placement":
      return `/market/${id}`;
    default:
      return undefined;
  }
}
