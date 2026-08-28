import { createHash } from "node:crypto";
import type { OriginationDacRecord } from "./types";

export interface DacContractTerms {
  cadastreNumber: string;
  crop: string;
  declaredAreaHectares: number | null;
  district: string | null;
  expectedVolumeTonnes: number | null;
  fieldId: string;
  harvestYear: number;
  issuerOrganizationId: string | null;
  landRightHolder: string;
  landRightType: string;
  producerOrganizationId: string;
  producerReference: string | null;
  qualityClass: string | null;
  region: string | null;
  verifiedAreaHectares: number | null;
  verifiedSnapshotId: string;
}

export function termsFromDac(dac: OriginationDacRecord): DacContractTerms {
  return {
    cadastreNumber: dac.cadastreNumber,
    crop: dac.crop,
    declaredAreaHectares: dac.declaredAreaHectares,
    district: dac.district,
    expectedVolumeTonnes: dac.expectedVolumeTonnes,
    fieldId: dac.fieldId,
    harvestYear: dac.harvestYear,
    issuerOrganizationId: dac.issuerOrganizationId,
    landRightHolder: dac.landRightHolder,
    landRightType: dac.landRightType,
    producerOrganizationId: dac.producerOrganizationId,
    producerReference: dac.producerReference,
    qualityClass: dac.qualityClass,
    region: dac.region,
    verifiedAreaHectares: dac.verifiedAreaHectares,
    verifiedSnapshotId: dac.verifiedSnapshotId,
  };
}

export function canonicalizeDacTerms(terms: DacContractTerms): string {
  return stableStringify(terms);
}

export function hashDacTerms(terms: DacContractTerms): string {
  return createHash("sha256").update(canonicalizeDacTerms(terms)).digest("hex");
}

export function hashCurrentDacTerms(dac: OriginationDacRecord): string {
  return hashDacTerms(termsFromDac(dac));
}

export function clearedDacConfirmations(): Pick<
  OriginationDacRecord,
  | "producerConfirmedTermsHash"
  | "producerConfirmedByUserId"
  | "producerConfirmedByRole"
  | "producerConfirmedAt"
  | "issuerConfirmedTermsHash"
  | "issuerConfirmedByUserId"
  | "issuerConfirmedByRole"
  | "issuerConfirmedAt"
> {
  return {
    producerConfirmedTermsHash: null,
    producerConfirmedByUserId: null,
    producerConfirmedByRole: null,
    producerConfirmedAt: null,
    issuerConfirmedTermsHash: null,
    issuerConfirmedByUserId: null,
    issuerConfirmedByRole: null,
    issuerConfirmedAt: null,
  };
}

export function shortenTermsHash(hash: string | null | undefined): string {
  if (!hash) {
    return "—";
  }
  return `${hash.slice(0, 12)}…`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
