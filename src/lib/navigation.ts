export const productName = "Field to Finance";
export const productSubtitle = "Digital Agricultural Finance Infrastructure";
export const prototypeBadge = "PROTOTYPE · SOLANA DEVNET";
export const footerDisclaimer =
  "Demonstration prototype only. No real agricultural assets, funds, securities, contractual rights or legal obligations are created or transferred.";

export const mainNav = [
  { href: "/", label: "Dashboard" },
  { href: "/contracts", label: "Contracts" },
  { href: "/pools", label: "Pools" },
  { href: "/tokens", label: "Tokens" },
  { href: "/finance", label: "Finance" },
  { href: "/compliance", label: "Compliance" },
  { href: "/regulator", label: "Regulator View" },
] as const;

export const lifecycleSteps = [
  { id: "field", label: "Field", href: "/contracts" },
  { id: "contract", label: "Contract", href: "/contracts" },
  { id: "pool", label: "Pool", href: "/pools" },
  { id: "risk", label: "Risk", href: "/pools/POOL-WHEAT-2027-01" },
  { id: "token", label: "Token", href: "/tokens" },
  { id: "finance", label: "Finance", href: "/finance" },
] as const;
