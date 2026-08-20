export const productName = "Field to Finance";
export const contactEmail = "amanbayev@gmail.com";

export const mainNav = [
  { href: "/", key: "dashboard" },
  { href: "/contracts", key: "contracts" },
  { href: "/pools", key: "pools" },
  { href: "/tokens", key: "tokens" },
  { href: "/finance", key: "finance" },
  { href: "/compliance", key: "compliance" },
  { href: "/regulator", key: "regulator" },
] as const;

export const lifecycleSteps = [
  { id: "field", href: "/contracts" },
  { id: "contract", href: "/contracts" },
  { id: "pool", href: "/pools" },
  { id: "risk", href: "/pools/POOL-WHEAT-2027-01" },
  { id: "token", href: "/tokens" },
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
