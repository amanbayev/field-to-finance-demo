import { describe, expect, it } from "vitest";
import {
  canonicalizeDacTerms,
  hashDacTerms,
  type DacContractTerms,
} from "./terms";

const sample: DacContractTerms = {
  cadastreNumber: "03:041:0123456:12",
  crop: "Wheat",
  declaredAreaHectares: 1240,
  district: "Astrakhan",
  expectedVolumeTonnes: 280,
  fieldId: "field-1",
  harvestYear: 2027,
  issuerOrganizationId: "issuer-1",
  landRightHolder: "Akmola Agro LLP",
  landRightType: "lease",
  producerOrganizationId: "producer-1",
  producerReference: "FIELD-2027-0014",
  qualityClass: "Class 3",
  region: "Akmola",
  verifiedAreaHectares: 1238.6,
  verifiedSnapshotId: "snap-1",
};

describe("DAC terms hash", () => {
  it("is deterministic and key-order independent", () => {
    const reversed: DacContractTerms = {
      verifiedSnapshotId: sample.verifiedSnapshotId,
      verifiedAreaHectares: sample.verifiedAreaHectares,
      region: sample.region,
      qualityClass: sample.qualityClass,
      producerReference: sample.producerReference,
      producerOrganizationId: sample.producerOrganizationId,
      landRightType: sample.landRightType,
      landRightHolder: sample.landRightHolder,
      issuerOrganizationId: sample.issuerOrganizationId,
      harvestYear: sample.harvestYear,
      fieldId: sample.fieldId,
      expectedVolumeTonnes: sample.expectedVolumeTonnes,
      district: sample.district,
      declaredAreaHectares: sample.declaredAreaHectares,
      crop: sample.crop,
      cadastreNumber: sample.cadastreNumber,
    };
    expect(canonicalizeDacTerms(reversed)).toBe(canonicalizeDacTerms(sample));
    expect(hashDacTerms(reversed)).toBe(hashDacTerms(sample));
    expect(hashDacTerms(sample)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a commercial term changes", () => {
    expect(hashDacTerms({ ...sample, expectedVolumeTonnes: 275 })).not.toBe(hashDacTerms(sample));
  });
});
