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
 * One step of a breadcrumb trail.
 *
 * Exclusive by construction: a crumb carries either a message key to localize
 * or a literal label (an identifier such as `WHEAT-2027`, or a protocol name),
 * never both and never neither. There is no empty-string fallback.
 */
export type HierarchyCrumb =
  | { level: HierarchyLevel; href?: string; labelKey: string; label?: never }
  | { level: HierarchyLevel; href?: string; label: string; labelKey?: never };

export function platformHref(): string {
  return "/";
}

export function marketsHref(): string {
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

export function instrumentsHref(): string {
  return "/instruments";
}

export function instrumentHref(instrumentId: string): string {
  return `/instruments/${instrumentId}`;
}

export function issuancesHref(): string {
  return "/issuances";
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

/** The platform root. The brand, not a collection. */
function platformCrumb(href?: string): HierarchyCrumb {
  return { level: "PLATFORM", href, labelKey: "breadcrumbPlatform" };
}

function protocolsCrumb(href?: string): HierarchyCrumb {
  return { level: "PROTOCOL", href, labelKey: "protocolsTitle" };
}

/** Trail for a bare platform-level screen. */
export function platformTrail(): HierarchyCrumb[] {
  return [platformCrumb()];
}

export function marketsTrail(): HierarchyCrumb[] {
  return [platformCrumb(platformHref()), { level: "MARKET", labelKey: "marketsTitle" }];
}

export function protocolsTrail(): HierarchyCrumb[] {
  return [platformCrumb(platformHref()), protocolsCrumb()];
}

export function instrumentsTrail(): HierarchyCrumb[] {
  return [
    platformCrumb(platformHref()),
    { level: "INSTRUMENT", labelKey: "instrumentsTitle" },
  ];
}

export function issuancesTrail(): HierarchyCrumb[] {
  return [
    platformCrumb(platformHref()),
    { level: "ISSUANCE", labelKey: "issuancesTitle" },
  ];
}

export function protocolTrail(protocol: AssetProtocol): HierarchyCrumb[] {
  return [
    platformCrumb(platformHref()),
    protocolsCrumb(protocolsHref()),
    { level: "PROTOCOL", label: protocol.name },
  ];
}

export function protocolVersionTrail(
  protocol: AssetProtocol,
  version: ProtocolVersion,
): HierarchyCrumb[] {
  return [
    platformCrumb(platformHref()),
    protocolsCrumb(protocolsHref()),
    { level: "PROTOCOL", href: protocolHref(protocol.id), label: protocol.name },
    { level: "PROTOCOL_VERSION", label: version.id },
  ];
}

/**
 * Ancestry above an instrument: Protocols -> Protocol -> Version.
 *
 * A level whose record is absent is omitted rather than guessed. The version
 * step appears only when the instrument's own binding resolves to a version of
 * that same protocol.
 */
function instrumentAncestry(
  instrument: MarketInstrument,
  protocol: AssetProtocol | null,
  version: ProtocolVersion | null,
): HierarchyCrumb[] {
  const trail: HierarchyCrumb[] = [platformCrumb(platformHref())];
  if (!protocol) {
    return trail;
  }
  trail.push(protocolsCrumb(protocolsHref()));
  trail.push({
    level: "PROTOCOL",
    href: protocolHref(protocol.id),
    label: protocol.name,
  });
  if (
    version &&
    version.protocolId === protocol.id &&
    version.id === instrument.protocolVersionId
  ) {
    trail.push({
      level: "PROTOCOL_VERSION",
      href: protocolVersionHref(protocol.id, version.id),
      label: version.id,
    });
  }
  return trail;
}

export function instrumentTrail(
  instrument: MarketInstrument,
  protocol: AssetProtocol | null,
  version: ProtocolVersion | null = null,
): HierarchyCrumb[] {
  return [
    ...instrumentAncestry(instrument, protocol, version),
    { level: "INSTRUMENT", label: instrument.symbol },
  ];
}

export function issuanceTrail(
  issuanceId: string,
  instrument: MarketInstrument | null,
  protocol: AssetProtocol | null,
  version: ProtocolVersion | null = null,
): HierarchyCrumb[] {
  if (!instrument) {
    return [
      platformCrumb(platformHref()),
      { level: "ISSUANCE", href: issuancesHref(), labelKey: "issuancesTitle" },
      { level: "ISSUANCE", label: issuanceId },
    ];
  }
  return [
    ...instrumentAncestry(instrument, protocol, version),
    {
      level: "INSTRUMENT",
      href: instrumentHref(instrument.id),
      label: instrument.symbol,
    },
    { level: "ISSUANCE", label: issuanceId },
  ];
}

export function marketTrail(
  instrument: MarketInstrument | null,
  protocol: AssetProtocol | null,
  version: ProtocolVersion | null = null,
  marketLabelKey = "sectionMarket",
): HierarchyCrumb[] {
  if (!instrument) {
    return [
      platformCrumb(platformHref()),
      { level: "MARKET", href: marketsHref(), labelKey: "marketsTitle" },
      { level: "MARKET", labelKey: marketLabelKey },
    ];
  }
  return [
    ...instrumentAncestry(instrument, protocol, version),
    {
      level: "INSTRUMENT",
      href: instrumentHref(instrument.id),
      label: instrument.symbol,
    },
    { level: "MARKET", labelKey: marketLabelKey },
  ];
}
