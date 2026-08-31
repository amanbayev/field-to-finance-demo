import type {
  AssetProtocol,
  MarketInstrument,
  ProtocolVersion,
} from "./types";

/**
 * Protocols are immutable by version. An issued instrument keeps a permanent
 * reference to the exact version it was created under and is never re-resolved
 * through the protocol's mutable `currentVersionId`.
 */
export const IMMUTABLE_PROTOCOL_VERSION_BINDING_RULE =
  "An ISSUED instrument resolves its governing rules only through its own protocolVersionId. " +
  "AssetProtocol.currentVersionId is a discovery pointer and must never be used as a fallback.";

export const PROTOCOL_VERSION_BINDING_VIOLATIONS = [
  "ISSUED_INSTRUMENT_WITHOUT_PROTOCOL_VERSION",
  "PROTOCOL_VERSION_NOT_FOUND",
  "PROTOCOL_VERSION_PROTOCOL_MISMATCH",
  "PROTOCOL_VERSION_NOT_FROZEN",
] as const;

export type ProtocolVersionBindingViolation =
  (typeof PROTOCOL_VERSION_BINDING_VIOLATIONS)[number];

export interface ProtocolVersionBindingResult {
  instrumentId: string;
  boundVersionId: string | null;
  violations: ProtocolVersionBindingViolation[];
}

export function protocolVersionById(
  versions: readonly ProtocolVersion[],
  id: string,
): ProtocolVersion | undefined {
  return versions.find((version) => version.id === id);
}

export function protocolVersionsForProtocol(
  versions: readonly ProtocolVersion[],
  protocolId: string,
): ProtocolVersion[] {
  return versions.filter((version) => version.protocolId === protocolId);
}

/**
 * Immutability is asserted by the `frozen` marker alone. A version may be frozen
 * without a recorded activation or freeze date; an absent date is not a defect
 * and must never be filled in with an invented one.
 */
export function isFrozenProtocolVersion(version: ProtocolVersion): boolean {
  return version.frozen;
}

/**
 * The protocol's current version, for discovery and for structuring new
 * instruments. Returns null when a protocol has no active version; no
 * placeholder version is ever invented.
 */
export function currentVersionForProtocol(
  versions: readonly ProtocolVersion[],
  protocol: AssetProtocol,
): ProtocolVersion | null {
  if (!protocol.currentVersionId) {
    return null;
  }
  const version = protocolVersionById(versions, protocol.currentVersionId);
  if (!version || version.protocolId !== protocol.id) {
    return null;
  }
  return version;
}

/**
 * Resolves the version that governs this instrument. Deliberately has no
 * fallback to the protocol's current version: an instrument with no binding
 * resolves to null rather than silently adopting today's rules.
 */
export function resolveGoverningProtocolVersion(
  instrument: MarketInstrument,
  versions: readonly ProtocolVersion[],
): ProtocolVersion | null {
  if (!instrument.protocolVersionId) {
    return null;
  }
  const version = protocolVersionById(versions, instrument.protocolVersionId);
  if (!version || version.protocolId !== instrument.assetProtocolId) {
    return null;
  }
  return version;
}

export function validateInstrumentVersionBinding(
  instrument: MarketInstrument,
  versions: readonly ProtocolVersion[],
): ProtocolVersionBindingResult {
  const violations: ProtocolVersionBindingViolation[] = [];
  const boundVersionId = instrument.protocolVersionId;

  if (!boundVersionId) {
    if (instrument.status === "ISSUED") {
      violations.push("ISSUED_INSTRUMENT_WITHOUT_PROTOCOL_VERSION");
    }
    return { instrumentId: instrument.id, boundVersionId: null, violations };
  }

  const version = protocolVersionById(versions, boundVersionId);
  if (!version) {
    violations.push("PROTOCOL_VERSION_NOT_FOUND");
    return { instrumentId: instrument.id, boundVersionId, violations };
  }
  if (version.protocolId !== instrument.assetProtocolId) {
    violations.push("PROTOCOL_VERSION_PROTOCOL_MISMATCH");
  }
  if (!isFrozenProtocolVersion(version)) {
    violations.push("PROTOCOL_VERSION_NOT_FROZEN");
  }
  return { instrumentId: instrument.id, boundVersionId, violations };
}

/** Returns only the offending rows. An empty array means the registry is valid. */
export function validateProtocolVersionRegistry(
  protocols: readonly AssetProtocol[],
  versions: readonly ProtocolVersion[],
  instruments: readonly MarketInstrument[],
): ProtocolVersionBindingResult[] {
  const results = instruments
    .map((instrument) => validateInstrumentVersionBinding(instrument, versions))
    .filter((result) => result.violations.length > 0);

  for (const protocol of protocols) {
    if (protocol.currentVersionId && !currentVersionForProtocol(versions, protocol)) {
      results.push({
        instrumentId: protocol.id,
        boundVersionId: protocol.currentVersionId,
        violations: ["PROTOCOL_VERSION_NOT_FOUND"],
      });
    }
  }

  return results;
}

export function assertImmutableProtocolVersionBindings(
  protocols: readonly AssetProtocol[],
  versions: readonly ProtocolVersion[],
  instruments: readonly MarketInstrument[],
): boolean {
  return validateProtocolVersionRegistry(protocols, versions, instruments).length === 0;
}
