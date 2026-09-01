import type {
  AssetProtocol,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";

/**
 * Presentation-layer model of the canonical product hierarchy:
 *
 *   Commodity Chain -> Protocol -> Protocol Version -> Instrument -> Issuance -> Market
 *
 * This lives in the presentation layer on purpose. It carries no domain truth:
 * it derives display trails from records the domain already owns, and it holds
 * message keys rather than localized text so the domain never learns about
 * language.
 */
export const HIERARCHY_LEVELS = [
  "PLATFORM",
  "PROTOCOL",
  "PROTOCOL_VERSION",
  "INSTRUMENT",
  "ISSUANCE",
  "MARKET",
] as const;

export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

export const HIERARCHY_LEVEL_KEYS: Record<HierarchyLevel, string> = {
  PLATFORM: "levelPlatform",
  PROTOCOL: "levelProtocol",
  PROTOCOL_VERSION: "levelProtocolVersion",
  INSTRUMENT: "levelInstrument",
  ISSUANCE: "levelIssuance",
  MARKET: "levelMarket",
};

/**
 * One step of a breadcrumb trail. `label` is literal text (an identifier such
 * as `WHEAT-2027` or a protocol name); `labelKey` is a message key to localize.
 * Exactly one of them is set.
 */
export interface HierarchyCrumb {
  level: HierarchyLevel;
  href?: string;
  label?: string;
  labelKey?: string;
}

export function platformHref(): string {
  return "/markets";
}

export function protocolsHref(): string {
  return "/protocols";
}

export function protocolHref(protocolId: string): string {
  return `/protocols/${protocolId}`;
}

export function protocolVersionHref(protocolId: string, versionId: string): string {
  return `/protocols/${protocolId}/versions/${versionId}`;
}

export function instrumentHref(instrumentId: string): string {
  return `/instruments/${instrumentId}`;
}

export function issuanceHref(issuanceId: string): string {
  return `/issuances/${issuanceId}`;
}

/**
 * The permanent version route for an instrument, derived from the instrument's
 * own `protocolVersionId`. Returns undefined when the instrument is not bound
 * to a version — never a guessed or current-version route.
 */
export function boundProtocolVersionHref(
  instrument: Pick<MarketInstrument, "assetProtocolId" | "protocolVersionId">,
): string | undefined {
  if (!instrument.protocolVersionId) {
    return undefined;
  }
  return protocolVersionHref(instrument.assetProtocolId, instrument.protocolVersionId);
}

const PLATFORM_CRUMB: HierarchyCrumb = {
  level: "PLATFORM",
  href: platformHref(),
  labelKey: "breadcrumbMarkets",
};

/** Trail for a platform-level screen. */
export function platformTrail(): HierarchyCrumb[] {
  return [{ level: "PLATFORM", labelKey: "breadcrumbMarkets" }];
}

/** Trail for the protocol catalogue. */
export function protocolsTrail(): HierarchyCrumb[] {
  return [PLATFORM_CRUMB, { level: "PROTOCOL", labelKey: "protocolsTitle" }];
}

export function protocolTrail(protocol: AssetProtocol): HierarchyCrumb[] {
  return [
    PLATFORM_CRUMB,
    { level: "PROTOCOL", href: protocolsHref(), labelKey: "protocolsTitle" },
    { level: "PROTOCOL", label: protocol.name },
  ];
}

export function protocolVersionTrail(
  protocol: AssetProtocol,
  version: ProtocolVersion,
): HierarchyCrumb[] {
  return [
    PLATFORM_CRUMB,
    { level: "PROTOCOL", href: protocolsHref(), labelKey: "protocolsTitle" },
    { level: "PROTOCOL", href: protocolHref(protocol.id), label: protocol.name },
    { level: "PROTOCOL_VERSION", label: version.id },
  ];
}

/**
 * Trail for an instrument. The protocol step is omitted when the protocol
 * record is absent rather than substituted with a placeholder level.
 */
export function instrumentTrail(
  instrument: MarketInstrument,
  protocol: AssetProtocol | null,
): HierarchyCrumb[] {
  const trail: HierarchyCrumb[] = [PLATFORM_CRUMB];
  if (protocol) {
    trail.push({
      level: "PROTOCOL",
      href: protocolHref(protocol.id),
      label: protocol.name,
    });
  }
  trail.push({ level: "INSTRUMENT", label: instrument.symbol });
  return trail;
}

export function issuanceTrail(
  issuanceId: string,
  instrument: MarketInstrument | null,
  protocol: AssetProtocol | null,
): HierarchyCrumb[] {
  const trail: HierarchyCrumb[] = [PLATFORM_CRUMB];
  if (protocol) {
    trail.push({
      level: "PROTOCOL",
      href: protocolHref(protocol.id),
      label: protocol.name,
    });
  }
  if (instrument) {
    trail.push({
      level: "INSTRUMENT",
      href: instrumentHref(instrument.id),
      label: instrument.symbol,
    });
  }
  trail.push({ level: "ISSUANCE", label: issuanceId });
  return trail;
}

export function marketTrail(
  instrument: MarketInstrument | null,
  protocol: AssetProtocol | null,
  marketLabelKey = "sectionMarket",
): HierarchyCrumb[] {
  const trail: HierarchyCrumb[] = [PLATFORM_CRUMB];
  if (protocol) {
    trail.push({
      level: "PROTOCOL",
      href: protocolHref(protocol.id),
      label: protocol.name,
    });
  }
  if (instrument) {
    trail.push({
      level: "INSTRUMENT",
      href: instrumentHref(instrument.id),
      label: instrument.symbol,
    });
  }
  trail.push({ level: "MARKET", labelKey: marketLabelKey });
  return trail;
}
