export const PREFIX_ACTIVE_HREFS = new Set([
  "/contracts",
  "/pools",
  "/market",
  "/instruments",
  "/protocols",
  "/markets",
  "/registry",
  "/clearing",
  "/fields",
]);

export function navHrefIsActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (pathname === href) {
    return true;
  }
  return PREFIX_ACTIVE_HREFS.has(href) && pathname.startsWith(`${href}/`);
}
