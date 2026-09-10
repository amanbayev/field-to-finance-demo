import { describe, expect, it } from "vitest";
import { protocolVersions } from "@/data/market-core/catalog";
import { parseProtocolVersionRecord } from "./protocol-version-record";
import textFixture from "./__fixtures__/protocol-version-text.json";

function row() {
  const snapshot = structuredClone(protocolVersions[0]);
  return {
    id: snapshot.id, protocol_id: snapshot.protocolId, snapshot,
    activated_at: null, frozen_at: null,
    provenance: { kind: "GIT_CATALOG_REFERENCE", repository: "synthetic repository",
      commit: "a".repeat(40), path: "synthetic source", exportName: "versions" },
    recorded_at: "2026-09-10T04:00:00.123456+00:00", recorded_by: "postgres",
  };
}

const fields = [
  ["snapshot", "displayVersion"], ["snapshot", "governanceNote"],
  ...["verificationModel", "riskModel", "coverageModel", "issuanceModel", "redemptionModel"]
    .map(key => ["snapshot", "rules", key]),
  ["snapshot", "rules", "lifecycle", "0"], ["snapshot", "rules", "modules", "0"],
  ...["repository", "path", "exportName"].map(key => ["provenance", key]),
  ["recorded_by"],
];

function withText(path: string[], value: string) {
  const input = row();
  let target = input as unknown as Record<string, unknown>;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[path.at(-1)!] = value;
  return input;
}

const cases = [
  ...textFixture.trimCodePoints.map(cp => ({ label: `trim U+${cp.toString(16)}`, value: String.fromCodePoint(cp), valid: false })),
  ...textFixture.nonTrimCodePoints.map(cp => ({ label: `non-trim U+${cp.toString(16)}`, value: String.fromCodePoint(cp), valid: true })),
  { label: "empty", value: "", valid: false },
  { label: "mixed whitespace", value: textFixture.mixedWhitespace, valid: false },
  { label: "text with whitespace at both edges", value: textFixture.edgedText, valid: true },
];

describe("MC-03 ECMAScript nonempty text contract", () => {
  it("pins the complete runtime trim set, including WhiteSpace and LineTerminator", () => {
    const actual = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (String.fromCodePoint(cp).trim() === "") actual.push(cp);
    }
    expect(actual).toEqual(textFixture.trimCodePoints);
  });

  it.each(cases)("$label applies to every free-text field without normalization", ({ value, valid }) => {
    for (const path of fields) {
      const input = withText(path, value);
      const before = structuredClone(input);
      const parsed = parseProtocolVersionRecord(input);
      expect(parsed !== null, path.join(".")).toBe(valid);
      expect(input).toEqual(before);
      if (parsed) {
        expect(parsed.snapshot).toEqual(input.snapshot);
        expect(parsed.provenance).toEqual(input.provenance);
        expect(parsed.recordedBy).toBe(input.recorded_by);
      }
    }
  });

  it("keeps empty lifecycle/modules valid", () => {
    const input = row();
    input.snapshot = { ...input.snapshot, rules: { ...input.snapshot.rules, lifecycle: [], modules: [] } };
    expect(parseProtocolVersionRecord(input)?.snapshot).toEqual(input.snapshot);
  });
});
