import type {
  AssetProtocol,
  MarketInstrument,
  ProtocolRuleSnapshot,
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

export const PROTOCOL_CURRENT_VERSION_VIOLATIONS = [
  "CURRENT_VERSION_NOT_FOUND",
  "CURRENT_VERSION_PROTOCOL_MISMATCH",
  "CURRENT_VERSION_NOT_ACTIVE",
  "CURRENT_VERSION_NOT_FROZEN",
] as const;

export type ProtocolCurrentVersionViolation =
  (typeof PROTOCOL_CURRENT_VERSION_VIOLATIONS)[number];

/** Protocol-level pointer result. Keyed by protocol id, never by instrument id. */
export interface ProtocolCurrentVersionResult {
  protocolId: string;
  currentVersionId: string | null;
  violations: ProtocolCurrentVersionViolation[];
}

/**
 * Registry health, with instrument bindings and protocol pointers reported
 * separately so neither is misrepresented as the other.
 */
export interface ProtocolVersionRegistryReport {
  instrumentBindings: readonly ProtocolVersionBindingResult[];
  protocolPointers: readonly ProtocolCurrentVersionResult[];
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
): readonly ProtocolVersion[] {
  return versions.filter((version) => version.protocolId === protocolId);
}

/**
 * Returns a deeply frozen copy of a protocol version.
 *
 * Lifecycle and modules are copied before freezing so that shared source arrays
 * (for example protocol-module constants reused elsewhere) are never frozen as
 * a side effect — only the copies this version owns.
 */
export function freezeProtocolVersion(version: ProtocolVersion): ProtocolVersion {
  const rules: ProtocolRuleSnapshot = Object.freeze({
    verificationModel: version.rules.verificationModel,
    riskModel: version.rules.riskModel,
    coverageModel: version.rules.coverageModel,
    issuanceModel: version.rules.issuanceModel,
    redemptionModel: version.rules.redemptionModel,
    lifecycle: Object.freeze([...version.rules.lifecycle]),
    modules: Object.freeze([...version.rules.modules]),
  });
  return Object.freeze({ ...version, rules });
}

/**
 * Returns a frozen registry of deeply frozen versions. The array itself is
 * frozen so callers cannot push, splice or reorder the canonical registry.
 */
export function freezeProtocolVersionRegistry(
  versions: readonly ProtocolVersion[],
): readonly ProtocolVersion[] {
  return Object.freeze(versions.map(freezeProtocolVersion));
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
 * The protocol's current usable demonstrator version, for discovery and for
 * structuring new instruments.
 *
 * Resolves only when the pointer names an existing version of this same
 * protocol that is both ACTIVE and frozen. A DRAFT, SUPERSEDED, RETIRED or
 * unfrozen version is not a usable current version, so this returns null rather
 * than presenting it as one. No placeholder version is ever invented.
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
  if (version.state !== "ACTIVE" || !isFrozenProtocolVersion(version)) {
    return null;
  }
  return version;
}

/**
 * Validates a protocol's `currentVersionId` discovery pointer. This is a
 * protocol-level check and is reported separately from instrument bindings —
 * a protocol id is not an instrument id.
 */
export function validateProtocolCurrentVersion(
  protocol: AssetProtocol,
  versions: readonly ProtocolVersion[],
): ProtocolCurrentVersionResult {
  const violations: ProtocolCurrentVersionViolation[] = [];
  const currentVersionId = protocol.currentVersionId;

  if (!currentVersionId) {
    return { protocolId: protocol.id, currentVersionId: null, violations };
  }

  const version = protocolVersionById(versions, currentVersionId);
  if (!version) {
    violations.push("CURRENT_VERSION_NOT_FOUND");
    return { protocolId: protocol.id, currentVersionId, violations };
  }
  if (version.protocolId !== protocol.id) {
    violations.push("CURRENT_VERSION_PROTOCOL_MISMATCH");
  }
  if (version.state !== "ACTIVE") {
    violations.push("CURRENT_VERSION_NOT_ACTIVE");
  }
  if (!isFrozenProtocolVersion(version)) {
    violations.push("CURRENT_VERSION_NOT_FROZEN");
  }
  return { protocolId: protocol.id, currentVersionId, violations };
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

/**
 * Reports only the offending rows in each category. A report with both arrays
 * empty means the registry is valid.
 */
export function validateProtocolVersionRegistry(
  protocols: readonly AssetProtocol[],
  versions: readonly ProtocolVersion[],
  instruments: readonly MarketInstrument[],
): ProtocolVersionRegistryReport {
  return {
    instrumentBindings: instruments
      .map((instrument) => validateInstrumentVersionBinding(instrument, versions))
      .filter((result) => result.violations.length > 0),
    protocolPointers: protocols
      .map((protocol) => validateProtocolCurrentVersion(protocol, versions))
      .filter((result) => result.violations.length > 0),
  };
}

export function assertImmutableProtocolVersionBindings(
  protocols: readonly AssetProtocol[],
  versions: readonly ProtocolVersion[],
  instruments: readonly MarketInstrument[],
): boolean {
  const report = validateProtocolVersionRegistry(protocols, versions, instruments);
  return report.instrumentBindings.length === 0 && report.protocolPointers.length === 0;
}
