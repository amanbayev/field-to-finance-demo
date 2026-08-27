export const INSTRUMENT_SHELL_TABS = [
  "overview",
  "terms",
  "basis",
  "risks",
  "market",
  "clearing",
  "ownership",
  "documents",
  "audit",
] as const;

export type InstrumentShellTab = (typeof INSTRUMENT_SHELL_TABS)[number];

export const DEFAULT_INSTRUMENT_SHELL_BASE = "/ui-v2/instruments";
export const DESIGN_REVIEW_INSTRUMENT_SHELL_BASE = "/ui-v2/design-review/instruments";

export const MARKET_WORKSTATION_TABS = [
  "market",
  "order-book",
  "trades",
  "depth",
  "positions",
  "orders",
  "market-data",
  "information",
  "contracts",
  "audit",
] as const;

export type MarketWorkstationTab = (typeof MARKET_WORKSTATION_TABS)[number];

export const DEFAULT_MARKET_WORKSTATION_BASE = "/ui-v2/markets";
export const DESIGN_REVIEW_MARKET_WORKSTATION_BASE = "/ui-v2/design-review/markets";

export function parseInstrumentShellTab(value: string | undefined): InstrumentShellTab {
  if (value && (INSTRUMENT_SHELL_TABS as readonly string[]).includes(value)) {
    return value as InstrumentShellTab;
  }
  return "overview";
}

export function instrumentShellHref(
  instrumentId: string,
  tab: InstrumentShellTab,
  basePath: string = DEFAULT_INSTRUMENT_SHELL_BASE,
): string {
  const root = `${basePath}/${instrumentId}`;
  if (tab === "overview") {
    return root;
  }
  return `${root}?tab=${tab}`;
}

export function instrumentShellBaseFromPathname(pathname: string): string | null {
  const match = pathname.match(/^(.*\/instruments)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function parseMarketWorkstationTab(value: string | undefined): MarketWorkstationTab {
  if (value && (MARKET_WORKSTATION_TABS as readonly string[]).includes(value)) {
    return value as MarketWorkstationTab;
  }
  return "market";
}

export function marketWorkstationHref(
  marketId: string,
  tab: MarketWorkstationTab = "market",
  basePath: string = DEFAULT_MARKET_WORKSTATION_BASE,
): string {
  const root = `${basePath}/${marketId}`;
  if (tab === "market") {
    return root;
  }
  return `${root}?tab=${tab}`;
}

export function marketWorkstationBaseFromInstrumentBase(instrumentBase: string): string {
  if (instrumentBase.includes("/design-review/")) {
    return DESIGN_REVIEW_MARKET_WORKSTATION_BASE;
  }
  return DEFAULT_MARKET_WORKSTATION_BASE;
}
