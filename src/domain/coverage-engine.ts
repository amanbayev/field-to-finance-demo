/**
 * Off-chain coverage engine.
 *
 * Rounding: eligible volume is integer floor division
 *   floor(gross * (10_000 - haircut_bps) / 10_000)
 * Haircut basis points are integers. Display percents are haircut_bps / 100.
 * No floating-point is used for the eligible-volume result.
 *
 * Risk sources in Phase 2 are labelled DEMO / SIMULATED. They are not live
 * satellite, insurer, or scoring integrations.
 */
import { createHash } from "node:crypto";

export const BPS_DENOMINATOR = 10_000;
export const COVERAGE_SNAPSHOT_VERSION = 1;
export const DEMO_SIMULATED_SOURCE = "DEMO / SIMULATED";

export type RiskAdjustmentCategory =
  | "Producer"
  | "Weather"
  | "RegionalConcentration"
  | "Quality"
  | "Insurance"
  | "Issuer";

export interface RiskAdjustment {
  type: RiskAdjustmentCategory;
  key: string;
  label: string;
  basisPoints: number;
  source: typeof DEMO_SIMULATED_SOURCE;
  status: "DEMO_SIMULATED";
  lastUpdated: string;
  evidenceReference: string;
}

export interface CoverageCalculationInput {
  poolId: string;
  grossVolumeTonnes: number;
  adjustments: RiskAdjustment[];
  calculatedAt: string;
  version?: number;
}

export interface CoverageSnapshot {
  poolId: string;
  grossVolumeTonnes: number;
  eligibleVolumeTonnes: number;
  totalHaircutBps: number;
  riskAdjustments: RiskAdjustment[];
  calculatedAt: string;
  version: number;
}

export interface CoverageResult {
  snapshot: CoverageSnapshot;
  canonicalJson: string;
  snapshotHash: Uint8Array;
  snapshotHashHex: string;
}

export class CoverageEngine {
  calculate(input: CoverageCalculationInput): CoverageResult {
    if (!Number.isInteger(input.grossVolumeTonnes) || input.grossVolumeTonnes < 0) {
      throw new Error("gross volume must be a non-negative integer");
    }
    for (const adjustment of input.adjustments) {
      if (!Number.isInteger(adjustment.basisPoints)) {
        throw new Error(`adjustment ${adjustment.type} must use integer basis points`);
      }
    }

    const netBps = input.adjustments.reduce(
      (sum, item) => sum + item.basisPoints,
      0,
    );
    const totalHaircutBps = Math.max(0, -netBps);
    if (totalHaircutBps > BPS_DENOMINATOR) {
      throw new Error("total haircut cannot exceed 100%");
    }

    const eligibleVolumeTonnes = eligibleVolumeFromHaircut(
      input.grossVolumeTonnes,
      totalHaircutBps,
    );

    const snapshot: CoverageSnapshot = {
      poolId: input.poolId,
      grossVolumeTonnes: input.grossVolumeTonnes,
      eligibleVolumeTonnes,
      totalHaircutBps,
      riskAdjustments: input.adjustments,
      calculatedAt: input.calculatedAt,
      version: input.version ?? COVERAGE_SNAPSHOT_VERSION,
    };

    const canonicalJson = canonicalize(snapshot);
    const snapshotHash = sha256(canonicalJson);
    return {
      snapshot,
      canonicalJson,
      snapshotHash,
      snapshotHashHex: bytesToHex(snapshotHash),
    };
  }
}

export const coverageEngine = new CoverageEngine();

export function eligibleVolumeFromHaircut(
  grossVolumeTonnes: number,
  haircutBps: number,
): number {
  if (!Number.isInteger(grossVolumeTonnes) || !Number.isInteger(haircutBps)) {
    throw new Error("coverage inputs must be integers");
  }
  if (haircutBps < 0 || haircutBps > BPS_DENOMINATOR) {
    throw new Error("haircut_bps must be between 0 and 10_000");
  }
  return Math.floor(
    (grossVolumeTonnes * (BPS_DENOMINATOR - haircutBps)) / BPS_DENOMINATOR,
  );
}

export function haircutPercentFromBps(haircutBps: number): number {
  return haircutBps / 100;
}

export function percentFromBps(basisPoints: number): number {
  return basisPoints / 100;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256(canonicalJson: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(canonicalJson, "utf8").digest());
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("hex length must be even");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function phase2WheatPoolAdjustments(calculatedAt: string): RiskAdjustment[] {
  return [
    {
      type: "Producer",
      key: "producer",
      label: "Producer Risk",
      basisPoints: -500,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-PRODUCER-WHEAT-2027",
    },
    {
      type: "Weather",
      key: "weather",
      label: "Weather / Satellite",
      basisPoints: -300,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-WEATHER-WHEAT-2027",
    },
    {
      type: "RegionalConcentration",
      key: "concentration",
      label: "Regional Concentration",
      basisPoints: -400,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-CONC-WHEAT-2027",
    },
    {
      type: "Quality",
      key: "quality",
      label: "Quality",
      basisPoints: -200,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-QUALITY-WHEAT-2027",
    },
    {
      type: "Insurance",
      key: "insurance",
      label: "Insurance",
      basisPoints: 200,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-INS-WHEAT-2027",
    },
    {
      type: "Issuer",
      key: "issuer",
      label: "Issuer Risk",
      basisPoints: -500,
      source: DEMO_SIMULATED_SOURCE,
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-ISSUER-WHEAT-2027",
    },
  ];
}

export const PHASE2_COVERAGE_CALCULATED_AT = "2026-08-21T12:00:00.000Z";

export function phase2WheatPoolCoverage(): CoverageResult {
  return coverageEngine.calculate({
    poolId: "POOL-WHEAT-2027-01",
    grossVolumeTonnes: 10_000,
    adjustments: phase2WheatPoolAdjustments(PHASE2_COVERAGE_CALCULATED_AT),
    calculatedAt: PHASE2_COVERAGE_CALCULATED_AT,
    version: COVERAGE_SNAPSHOT_VERSION,
  });
}
