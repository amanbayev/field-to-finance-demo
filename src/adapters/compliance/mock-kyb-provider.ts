import type { CheckResult } from "@/domain";
import { complianceRecords } from "@/data/mock/compliance";
import type { KybProvider } from "./types";

export class MockKybProvider implements KybProvider {
  getKybStatus(participantId: string): CheckResult {
    return (
      complianceRecords.find((record) => record.participantId === participantId)
        ?.kyb ?? "PENDING"
    );
  }
}
