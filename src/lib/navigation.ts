export const productName = "Field to Finance";
export const contactEmail = "amanbayev@gmail.com";

export const navGroups = [
  {
    key: "overview",
    items: [{ href: "/", key: "dashboard" }],
  },
  {
    key: "assets",
    items: [
      { href: "/contracts", key: "contracts" },
      { href: "/pools", key: "pools" },
      { href: "/tokens", key: "tokens" },
    ],
  },
  {
    key: "market",
    items: [
      { href: "/market", key: "marketPage" },
      { href: "/finance", key: "finance" },
    ],
  },
  {
    key: "control",
    items: [
      { href: "/compliance", key: "compliance" },
      { href: "/scas", key: "scas" },
      { href: "/regulator", key: "regulator" },
    ],
  },
] as const;

export const mainNav: Array<(typeof navGroups)[number]["items"][number]> =
  navGroups.flatMap((group) => [...group.items]);

export const lifecycleSteps = [
  { id: "field", href: "/contracts" },
  { id: "contract", href: "/contracts" },
  { id: "pool", href: "/pools" },
  { id: "risk", href: "/pools/POOL-WHEAT-2027-01" },
  { id: "token", href: "/tokens" },
  { id: "placement", href: "/market" },
  { id: "finance", href: "/finance" },
] as const;

export const complianceControlKeys = [
  "kyc",
  "kyb",
  "kyt",
  "wallet",
  "sanctions",
  "pep",
  "eligibility",
] as const;

export const regulatorTopicKeys = [
  "provenance",
  "verification",
  "pool",
  "scoring",
  "satellite",
  "insurance",
  "haircut",
  "coverage",
  "supply",
  "compliance",
  "audit",
] as const;
