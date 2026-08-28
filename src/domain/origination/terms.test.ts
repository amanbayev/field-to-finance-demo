import { describe, expect, it } from "vitest";
import {
  canonicalizeDacTerms,
  hashDacTerms,
  type DacContractTerms,
} from "./terms";

const sample: DacContractTerms = {
  cadastreNumber: "03:041:0123456:12",
  contractedVolumeTonnes: 280,
  crop: "Wheat",
  declaredAreaHectares: 1240,
  deliveryEndDate: "2027-09-30",
  deliveryLocation: "Astana elevator",
  deliveryStartDate: "2027-08-01",
  district: "Astrakhan",
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
      district: sample.district,
      deliveryStartDate: sample.deliveryStartDate,
      deliveryLocation: sample.deliveryLocation,
      deliveryEndDate: sample.deliveryEndDate,
      declaredAreaHectares: sample.declaredAreaHectares,
      crop: sample.crop,
      contractedVolumeTonnes: sample.contractedVolumeTonnes,
      cadastreNumber: sample.cadastreNumber,
    };
    expect(canonicalizeDacTerms(reversed)).toBe(canonicalizeDacTerms(sample));
    expect(hashDacTerms(reversed)).toBe(hashDacTerms(sample));
    expect(hashDacTerms(sample)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when contracted volume or a delivery term changes", () => {
    expect(hashDacTerms({ ...sample, contractedVolumeTonnes: 275 })).not.toBe(hashDacTerms(sample));
    expect(hashDacTerms({ ...sample, deliveryStartDate: "2027-08-15" })).not.toBe(hashDacTerms(sample));
    expect(hashDacTerms({ ...sample, deliveryEndDate: "2027-10-01" })).not.toBe(hashDacTerms(sample));
    expect(hashDacTerms({ ...sample, deliveryLocation: "Kostanay elevator" })).not.toBe(
      hashDacTerms(sample),
    );
  });
});
