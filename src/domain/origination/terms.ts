import { createHash } from "node:crypto";
import type { OriginationDacRecord } from "./types";

export interface DacContractTerms {
  cadastreNumber: string;
  contractedVolumeTonnes: number | null;
  crop: string;
  declaredAreaHectares: number | null;
  deliveryEndDate: string | null;
  deliveryLocation: string | null;
  deliveryStartDate: string | null;
  district: string | null;
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

export const DAC_FROZEN_TERM_KEYS = [
  "issuerOrganizationId",
  "crop",
  "harvestYear",
  "contractedVolumeTonnes",
  "qualityClass",
  "producerReference",
  "deliveryStartDate",
  "deliveryEndDate",
  "deliveryLocation",
] as const satisfies readonly (keyof OriginationDacRecord)[];

export function termsFromDac(dac: OriginationDacRecord): DacContractTerms {
  return {
    cadastreNumber: dac.cadastreNumber,
    contractedVolumeTonnes: dac.contractedVolumeTonnes,
    crop: dac.crop,
    declaredAreaHectares: dac.declaredAreaHectares,
    deliveryEndDate: dac.deliveryEndDate,
    deliveryLocation: dac.deliveryLocation,
    deliveryStartDate: dac.deliveryStartDate,
    district: dac.district,
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

export function executedTermsSnapshotFromDac(dac: OriginationDacRecord): Record<string, unknown> {
  return { ...termsFromDac(dac) };
}

export function frozenContractTermsFrom(
  dac: OriginationDacRecord,
): Pick<OriginationDacRecord, (typeof DAC_FROZEN_TERM_KEYS)[number]> {
  return {
    issuerOrganizationId: dac.issuerOrganizationId,
    crop: dac.crop,
    harvestYear: dac.harvestYear,
    contractedVolumeTonnes: dac.contractedVolumeTonnes,
    qualityClass: dac.qualityClass,
    producerReference: dac.producerReference,
    deliveryStartDate: dac.deliveryStartDate,
    deliveryEndDate: dac.deliveryEndDate,
    deliveryLocation: dac.deliveryLocation,
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

export function normalizeIsoDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function deliveryEndPrecedesStart(start: string | null, end: string | null): boolean {
  if (!start || !end) {
    return false;
  }
  return end < start;
}

export function hasSendableDeliveryTerms(dac: Pick<
  OriginationDacRecord,
  "deliveryStartDate" | "deliveryEndDate" | "deliveryLocation"
>): boolean {
  return Boolean(
    dac.deliveryStartDate &&
      dac.deliveryEndDate &&
      !deliveryEndPrecedesStart(dac.deliveryStartDate, dac.deliveryEndDate) &&
      dac.deliveryLocation?.trim(),
  );
}

export function hasSendableContractedVolume(volume: number | null | undefined): boolean {
  return volume != null && volume > 0;
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
