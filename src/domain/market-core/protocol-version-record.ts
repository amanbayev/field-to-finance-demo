import { freezeProtocolVersion } from "./protocol-version";
import type { ProtocolVersion } from "./types";

export interface ProtocolVersionRecord {
  readonly id: string;
  readonly protocolId: string;
  readonly snapshot: ProtocolVersion;
  readonly activatedAt: string | null;
  readonly frozenAt: string | null;
  readonly provenance: Readonly<{
    kind: "GIT_CATALOG_REFERENCE";
    repository: string;
    commit: string;
    path: string;
    exportName: string;
  }>;
  readonly recordedAt: string;
  readonly recordedBy: string;
}

export function isProtocolReferenceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** RFC3339, with a real calendar date; no Date.parse normalization of invalid days. */
function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, y, m, d, h, min, sec, oh, om] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(h) <= 23 && Number(min) <= 59 && Number(sec) <= 59
    && (oh === undefined || (Number(oh) <= 15 && Number(om) <= 59))
    && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

/** Validates the entire v1 snapshot before copying/freezing; never repairs JSON. */
export function parseFrozenProtocolSnapshot(value: unknown): ProtocolVersion | null {
  if (!object(value) || !keys(value, ["id", "protocolId", "displayVersion", "state", "frozen",
    "activatedAt", "frozenAt", "supersedesVersionId", "supersededByVersionId", "governanceNote", "rules"])) return null;
  const r = value.rules;
  if (!isProtocolReferenceId(value.id) || !isProtocolReferenceId(value.protocolId)
    || !text(value.displayVersion) || !text(value.governanceNote) || value.frozen !== true
    || !(value.state === "DRAFT" || value.state === "ACTIVE" || value.state === "SUPERSEDED" || value.state === "RETIRED")
    || !nullableTimestamp(value.activatedAt) || !nullableTimestamp(value.frozenAt)
    || !(value.supersedesVersionId === null || isProtocolReferenceId(value.supersedesVersionId))
    || !(value.supersededByVersionId === null || isProtocolReferenceId(value.supersededByVersionId))
    || !object(r) || !keys(r, ["verificationModel", "riskModel", "coverageModel", "issuanceModel", "redemptionModel", "lifecycle", "modules"])
    || !text(r.verificationModel) || !text(r.riskModel) || !text(r.coverageModel)
    || !text(r.issuanceModel) || !text(r.redemptionModel)
    || !Array.isArray(r.lifecycle) || !r.lifecycle.every(text)
    || !Array.isArray(r.modules) || !r.modules.every(text)) return null;
  return freezeProtocolVersion({
    id: value.id, protocolId: value.protocolId, displayVersion: value.displayVersion,
    state: value.state, frozen: true, activatedAt: value.activatedAt, frozenAt: value.frozenAt,
    supersedesVersionId: value.supersedesVersionId, supersededByVersionId: value.supersededByVersionId,
    governanceNote: value.governanceNote,
    rules: { verificationModel: r.verificationModel, riskModel: r.riskModel,
      coverageModel: r.coverageModel, issuanceModel: r.issuanceModel, redemptionModel: r.redemptionModel,
      lifecycle: r.lifecycle, modules: r.modules },
  });
}

export function parseProtocolVersionRecord(value: unknown): ProtocolVersionRecord | null {
  if (!object(value) || !keys(value, ["id", "protocol_id", "snapshot", "activated_at", "frozen_at",
    "provenance", "recorded_at", "recorded_by"])) return null;
  const snapshot = parseFrozenProtocolSnapshot(value.snapshot);
  const p = value.provenance;
  if (!snapshot || value.id !== snapshot.id || value.protocol_id !== snapshot.protocolId
    || value.activated_at !== snapshot.activatedAt || value.frozen_at !== snapshot.frozenAt
    || !timestamp(value.recorded_at) || !text(value.recorded_by)
    || !object(p) || !keys(p, ["kind", "repository", "commit", "path", "exportName"])
    || p.kind !== "GIT_CATALOG_REFERENCE" || !text(p.repository) || !text(p.path) || !text(p.exportName)
    || typeof p.commit !== "string" || !/^[0-9a-f]{40}$/.test(p.commit)) return null;
  return Object.freeze({ id: snapshot.id, protocolId: snapshot.protocolId, snapshot,
    activatedAt: snapshot.activatedAt, frozenAt: snapshot.frozenAt,
    provenance: Object.freeze({ kind: p.kind, repository: p.repository, commit: p.commit,
      path: p.path, exportName: p.exportName }), recordedAt: value.recorded_at, recordedBy: value.recorded_by });
}
