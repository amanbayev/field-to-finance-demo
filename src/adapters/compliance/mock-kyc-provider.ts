import type { CheckResult } from "@/domain";
import { complianceRecords } from "@/data/mock/compliance";
import type { KycProvider } from "./types";

export class MockKycProvider implements KycProvider {
  getKycStatus(participantId: string): CheckResult {
    return (
      complianceRecords.find((record) => record.participantId === participantId)
        ?.kyc ?? "PENDING"
    );
  }
}
